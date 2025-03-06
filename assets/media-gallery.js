if (!customElements.get('media-gallery')) {
  class MediaGallery extends HTMLElement {
    constructor() {
      super();

      if (Shopify.designMode) {
        setTimeout(() => this.init(), 200);
      } else {
        this.init();
      }
    }

    disconnectedCallback() {
      window.removeEventListener('on:debounced-resize', this.resizeHandler);

      if (this.resizeInitHandler) {
        window.removeEventListener('on:debounced-resize', this.resizeInitHandler);
      }

      if (this.zoomInitHandler) {
        window.removeEventListener('on:debounced-resize', this.zoomInitHandler);
      }
    }

    init() {
      this.section = this.closest('.js-product');
      this.noSelectedVariant = this.hasAttribute('data-no-selected-variant');
      this.mediaGroupingEnabled = this.hasAttribute('data-media-grouping-enabled')
        && this.getMediaGroupData();
      this.stackedScroll = this.dataset.stackedScroll;
      this.stackedUnderline = this.dataset.stackedUnderline === 'true' && !this.mediaGroupingEnabled;
      this.isFeatured = this.dataset.isFeatured === 'true';
      this.viewer = this.querySelector('.media-viewer');
      this.thumbs = this.querySelector('.media-thumbs');
      this.thumbsItems = this.querySelectorAll('.media-thumbs__item');
      this.controls = this.querySelector('.media-ctrl');
      this.prevBtn = this.querySelector('.media-ctrl__btn[name="prev"]');
      this.nextBtn = this.querySelector('.media-ctrl__btn[name="next"]');
      this.counterCurrent = this.querySelector('.media-ctrl__current-item');
      this.counterTotal = this.querySelector('.media-ctrl__total-items');
      this.liveRegion = this.querySelector('.media-gallery__status');
      this.zoomLinks = this.querySelectorAll('.js-zoom-link');
      this.loadingSpinner = this.querySelector('.loading-spinner');
      this.xrButton = this.querySelector('.media-xr-button');

      if (this.hasAttribute('data-zoom-enabled')) {
        this.galleryModal = this.querySelector('.js-media-zoom-template').content.firstElementChild.cloneNode(true);
      }

      if (this.mediaGroupingEnabled && !this.noSelectedVariant) {
        this.setActiveMediaGroup(this.getMediaGroupFromOptionSelectors());
      }

      if (this.dataset.layout === 'stacked' && theme.mediaMatches.md) {
        this.resizeInitHandler = this.resizeInitHandler || this.initGallery.bind(this);
        window.addEventListener('on:debounced-resize', this.resizeInitHandler);
        this.setVisibleItems();
        this.previousMediaItem = this.querySelector('.media-viewer__item.is-current-variant');
        setTimeout(() => this.customSetActiveMedia(this.previousMediaItem, this.stackedScroll === 'always'), 200);
      } else {
        this.initGallery();
      }

      if (this.zoomLinks) {
        if (this.dataset.zoomTrigger === 'hover') {
          this.triggerZoomInit();
        } else {
          this.zoomLinks.forEach((zoomLink) => {
            zoomLink.addEventListener('click', (evt) => {
              this.triggerZoomInit();
              evt.preventDefault();
            });
          });
        }
      }

      this.section.addEventListener('on:variant:change', this.onVariantChange.bind(this));
    }

    triggerZoomInit() {
      this.zoomInitHandler = this.zoomInitHandler || this.initZoom.bind(this);
      this.zoomEventListener = this.zoomEventListener || this.handleZoomMouseMove.bind(this);
      window.addEventListener('on:debounced-resize', this.zoomInitHandler);
      this.initZoom();
      this.zoomLinks.forEach((zoomLink) => {
        zoomLink.addEventListener('click', (evt) => {
          evt.preventDefault();
        });
      });
    }

    /**
     * Extrae el código de color de un nombre de imagen.
     * @param {string} imageName - Nombre de la imagen (ej: 700600-142, 700600-142_2, 700600-142-3)
     * @returns {string|null} - El código de color o null si no se encuentra
     */
    extractColorCode(imageName) {
      const matches = imageName.match(/-(\d+)/);
      return matches ? matches[1] : null;
    }

    /**
     * Handle a change in variant on the page.
     * @param {Event} evt - variant change event dispatched by variant-picker
     */
    onVariantChange(evt) {
      // Si no hay detalles de variante, no hacer nada
      if (!evt.detail.variant) return;

      // Si la agrupación de medios está habilitada con el método original,
      // mantenerla por compatibilidad
      if (this.mediaGroupingEnabled) {
        this.setActiveMediaGroup(this.getMediaGroupFromOptionSelectors());
      }

      // Intentar obtener el código de color de la variante seleccionada
      let colorCode = this.getColorCodeFromVariant(evt.detail.variant);
      console.log(colorCode);
      

      // Si encontramos un código de color...
      if (colorCode) {
        // Establecer el grupo de medios activo basado en el código de color
        this.setActiveMediaGroup(colorCode);

        // Buscar el primer elemento multimedia con este código de color
        const mediaWithColor = Array.from(this.viewer.querySelectorAll('[data-image-name]'))
          .filter(el => {
            const elColorCode = this.extractColorCode(el.dataset.imageName);
            return elColorCode === colorCode;
          });

        // Si encontramos al menos un elemento con este código de color
        if (mediaWithColor.length > 0) {
          // Establecer el primer elemento como activo
          this.customSetActiveMedia(mediaWithColor[0], true);
          return;
        }
      }

      // Si no pudimos usar el código de color o no hay elementos multimedia con ese código,
      // volver al comportamiento predeterminado usando featured_media
      if (evt.detail.variant && evt.detail.variant.featured_media) {
        const variantMedia = this.viewer.querySelector(
          `[data-media-id="${evt.detail.variant.featured_media.id}"]`
        );

        if (variantMedia) {
          this.customSetActiveMedia(variantMedia, true);
        }
      }
    }

    /**
     * Obtiene el código de color de la variante seleccionada.
     * @param {Object} variant - Objeto de variante de Shopify
     * @returns {string|null} - Código de color o null si no se encuentra
     */
    getColorCodeFromVariant(variant) {
      // Método 1: Extraer del título de la variante (formato: "142-ARENA / XXS")
      if (variant.title) {
        // Si el título comienza con el código numérico seguido de un guion
        const titleMatch = variant.title.match(/^(\d+)-/);
        if (titleMatch) {
          return titleMatch[1];
        }
      }
      
      // Método 2: Extraer del src de la imagen (formato: "...700600-142_2.jpg...")
      if (variant.featured_media && 
          variant.featured_media.preview_image && 
          variant.featured_media.preview_image.src) {
        const src = variant.featured_media.preview_image.src;
        
        // Extraer el nombre del archivo de la URL
        const fileName = src.split('/').pop().split('?')[0];
        
        // Buscar el patrón modelo-código en el nombre del archivo
        const fileMatch = fileName.match(/-(\d+)([_\-.]|$)/);
        if (fileMatch) {
          return fileMatch[1];
        }
      }
      
      // Método de respaldo: Buscar cualquier secuencia numérica en el título
      if (variant.title) {
        const numericMatch = variant.title.match(/\b(\d+)\b/);
        if (numericMatch) {
          return numericMatch[1];
        }
      }
      
      // Si no se encuentra el código de color, registrar y devolver null
      console.warn('No se pudo encontrar código de color para la variante:', variant.title || 'Sin título');
      return null;
    }
    /* onVariantChange(evt) {
      if (this.mediaGroupingEnabled) {
        this.setActiveMediaGroup(this.getMediaGroupFromOptionSelectors());
      }

      if (evt.detail.variant && evt.detail.variant.featured_media) {
        const variantMedia = this.viewer.querySelector(
          `[data-media-id="${evt.detail.variant.featured_media.id}"]`
        );
        this.customSetActiveMedia(variantMedia, true);
      }
    } */

    /**
     * Gets the media group from currently selected variant options.
     * @returns {?object}
     */
/*     getMediaGroupFromOptionSelectors() {
      const optionSelectors = this.section.querySelectorAll('.option-selector');
      if (optionSelectors.length > this.getMediaGroupData().groupOptionIndex) {
        const selector = optionSelectors[this.getMediaGroupData().groupOptionIndex];
        if (selector.dataset.selectorType === 'dropdown') {
          return selector.querySelector('.custom-select__btn').textContent.trim();
        }
        return selector.querySelector('input:checked').value;
      }
      return null;
    } */
    getMediaGroupFromOptionSelectors() {
      const optionSelectors = this.section.querySelectorAll('.option-selector');
      
      // Si no hay suficientes selectores o no hay un índice de grupo definido, salir
      if (!optionSelectors.length || typeof this.getMediaGroupData().groupOptionIndex === 'undefined') {
        return null;
      }
      
      // Obtener el selector correspondiente al índice del grupo
      const selector = optionSelectors[this.getMediaGroupData().groupOptionIndex];
      if (!selector) return null;
      
      // Obtener el valor seleccionado según el tipo de selector
      let selectedValue = '';
      if (selector.dataset.selectorType === 'dropdown') {
        selectedValue = selector.querySelector('.custom-select__btn').textContent.trim();
      } else {
        const checkedInput = selector.querySelector('input:checked');
        selectedValue = checkedInput ? checkedInput.value : '';
      }

      // No hay valor seleccionado
      if (!selectedValue) return null;
      
      // Extraer el código de color del valor seleccionado
      
      // Caso 1: El valor comienza con el código numérico (ej: "142-ARENA")
      const prefixMatch = selectedValue.match(/^(\d+)-/);
      if (prefixMatch) {
        return prefixMatch[1];
      }
      
      // Caso 2: El código numérico está entre barras (ej: "Color / 142 / Tamaño")
      const slashSeparatedParts = selectedValue.split('/');
      for (const part of slashSeparatedParts) {
        const trimmedPart = part.trim();
        if (/^\d+$/.test(trimmedPart)) {
          return trimmedPart;
        }
      }
      
      // Caso 3: Buscar cualquier secuencia numérica en el valor
      const numericMatch = selectedValue.match(/\b(\d+)\b/);
      if (numericMatch) {
        return numericMatch[1];
      }
      
      // Si no se encuentra un código de color, devolver el valor original para mantener compatibilidad
      return selectedValue;
    }

    /**
     * Gets the variant media associations for a product.
     * @returns {?object}
     */
    getMediaGroupData() {
      if (typeof this.variantMediaData === 'undefined') {
        const dataEl = this.querySelector('.js-data-variant-media');
        this.variantMediaData = dataEl ? JSON.parse(dataEl.textContent) : false;
      }

      return this.variantMediaData;
    }

    /**
     * Gets an object mapping media to groups, and the reverse
     * @returns {?object}
     */
    getMediaGroupMap() {
      if (!this.mediaGroupMap) {
        this.mediaGroupMap = {
          groups: {}
        };

        // Obtener los elementos del visor
        this.viewerItems = this.querySelectorAll('.media-viewer__item');

        // Iterar por cada elemento de medio
        this.viewerItems.forEach((item) => {
          // Verificar si tiene el atributo data-image-name
          if (!item.dataset.imageName) return;

          // Extraer el código de color del nombre de la imagen
          const colorCode = this.extractColorCode(item.dataset.imageName);
          // Si no se pudo extraer un código de color, omitir este elemento
          if (!colorCode) return;

          // Crear el grupo para este código de color si no existe
          if (!this.mediaGroupMap.groups[colorCode]) {
            this.mediaGroupMap.groups[colorCode] = {
              name: colorCode,
              items: []
            };
          }

          // Crear el objeto de ítem para este elemento
          const groupItem = { main: item };

          // Si hay thumbnails, encontrar el thumbnail correspondiente
          if (this.thumbs) {
            groupItem.thumb = this.thumbs.querySelector(
              `[data-image-name="${item.dataset.imageName}"].media-thumbs__item`
            );
          }

          // Añadir el ítem al grupo correspondiente
          this.mediaGroupMap.groups[colorCode].items.push(groupItem);
        });

        // Método helper para encontrar el grupo de un ítem por su código de color
        this.mediaGroupMap.groupFromItem = (item) => {
          // Si no hay ítem o no tiene nombre de imagen, no se puede determinar el grupo
          if (!item || !item.dataset.imageName) return null;

          // Extraer el código de color del nombre de la imagen
          const itemColorCode = this.extractColorCode(item.dataset.imageName);

          // Si no hay código de color o no existe un grupo para ese código, devolver null
          if (!itemColorCode || !this.mediaGroupMap.groups[itemColorCode]) {
            return null;
          }

          // Devolver el grupo correspondiente al código de color
          return this.mediaGroupMap.groups[itemColorCode];
        };
      }

      return this.mediaGroupMap;
    }

    /* getMediaGroupMap() {
      if (!this.mediaGroupMap) {
        this.mediaGroupMap = {
          groups: {}
        };

        // set up grouping
        const variantMediaData = this.getMediaGroupData();
        let currentMediaOptionName = false;
        this.viewerItems = this.querySelectorAll('.media-viewer__item');
        this.viewerItems.forEach((item) => {
          for (let i = 0; i < variantMediaData.variantMedia.length; i += 1) {
            if (parseInt(item.dataset.mediaId, 10) === variantMediaData.variantMedia[i].mediaId) {
              if (currentMediaOptionName !== variantMediaData.variantMedia[i].option) {
                currentMediaOptionName = variantMediaData.variantMedia[i].option;
              }
            }
          }
          if (currentMediaOptionName) {
            if (!this.mediaGroupMap.groups[currentMediaOptionName]) {
              this.mediaGroupMap.groups[currentMediaOptionName] = {
                name: currentMediaOptionName,
                items: []
              };
            }
            const groupItem = { main: item };
            if (this.thumbs) {
              groupItem.thumb = this.thumbs.querySelector(
                `[data-media-id="${item.dataset.mediaId}"].media-thumbs__item`
              );
            }
            this.mediaGroupMap.groups[currentMediaOptionName].items.push(groupItem);
          }
        });

        // add helper
        this.mediaGroupMap.groupFromItem = (item) => {
          const groups = Object.keys(this.mediaGroupMap.groups);
          for (let i = 0; i < groups; i += 1) {
            const group = groups[i];
            for (let j = 0; j < this.mediaGroupMap.groups[group].items.length; j += 1) {
              if (this.mediaGroupMap.groups[group].items[j] === item) {
                return this.mediaGroupMap.groups[group];
              }
            }
          }
          return this.mediaGroupMap.groups[Object.keys(this.mediaGroupMap.groups)[0]];
        };
      }

      return this.mediaGroupMap;
    } */

    /**
     * Show only images associated to the current variant
     * @param {string} groupName - optional - Group to show (uses this.currentItem if empty)
     */
    setActiveMediaGroup(groupName) {
      const mediaGroupMap = this.getMediaGroupMap();
      const selectedGroup = groupName
        ? mediaGroupMap.groups[groupName]
        : mediaGroupMap.groupFromItem(this.currentItem);

      if (selectedGroup) {
        if (this.currentGroup !== selectedGroup) {
          this.currentGroup = selectedGroup;
          this.viewerItems.forEach((item) => {
            item.style.display = 'none';
            item.classList.remove('media-viewer__item--single');
          });
          this.thumbsItems.forEach((item) => {
            item.style.display = 'none';
          });

          let currentItemIsVisible = false;
          selectedGroup.items.forEach((item) => {
            item.main.style.display = '';
            if (item.thumb) {
              item.thumb.style.display = '';
            }
            if (item.main === this.currentItem) {
              currentItemIsVisible = true;
            }
          });
          this.setVisibleItems();

          // If current item is not in this group, set it as the active item
          if (!currentItemIsVisible) {
            this.customSetActiveMedia(selectedGroup.items[0].main, true);
          }

          // Handle single images on stacked view
          if (selectedGroup.items.length === 1) {
            selectedGroup.items[0].main.classList.add('media-viewer__item--single');
          }
        }
      } else {
        this.viewerItems.forEach((item) => {
          item.style.display = '';
        });
        this.thumbsItems.forEach((item) => {
          item.style.display = '';
        });
      }
    }

    /**
     * Initialises the media gallery slider and associated controls.
     */
    initGallery() {
      this.setVisibleItems();
      if (this.visibleItems.length <= 1) return;

      this.viewerItemOffset = this.visibleItems[1].offsetLeft - this.visibleItems[0].offsetLeft;
      this.currentIndex = Math.round(this.viewer.scrollLeft / this.viewerItemOffset);
      this.currentItem = this.visibleItems[this.currentIndex];
      this.addListeners();

      if (this.thumbs && this.currentItem) {
        this.currentThumb = this.thumbs.querySelector(
          `[data-media-id="${this.currentItem.dataset.mediaId}"]`
        );
      }

      if (!this.isFeatured && document.hasFocus()) {
        // Eager load the slider images for smooth UX
        this.viewer.querySelectorAll('.product-image[loading="lazy"]').forEach((img, index) => {
          setTimeout(() => {
            img.loading = 'eager';
          }, 500 * (index + 1));
        });
      }

      const currentItem = this.querySelector('.media-viewer__item.is-current-variant');
      this.customSetActiveMedia(currentItem, true);
    }

    addListeners() {
      this.viewer.addEventListener('scroll', this.handleScroll.bind(this));
      if (this.controls) this.controls.addEventListener('click', this.handleNavClick.bind(this));
      if (this.thumbs) this.thumbs.addEventListener('click', this.handleThumbClick.bind(this));
      this.resizeHandler = this.resizeHandler || this.handleResize.bind(this);
      window.addEventListener('on:debounced-resize', this.resizeHandler);
    }

    /**
     * Initialized the zoom on hover for desktop
     */
    initZoom() {
      this.zoomLinks.forEach((el) => {
        const zoomWidth = Number(el.querySelector('.zoom-image').dataset.originalWidth || 0);
        const imageWidth = el.querySelector('.product-image').getBoundingClientRect().width;
        if (theme.mediaMatches.md && ((zoomWidth - 75) > (imageWidth))) {
          el.addEventListener('mousemove', this.zoomEventListener);
          el.classList.remove('pointer-events-none');
        } else {
          el.removeEventListener('mousemove', this.zoomEventListener);
          el.classList.add('pointer-events-none');
        }
      });
    }

    /**
     * Handles mouse move over a zoomable image
     * @param {?object} evt - Event object.
     */
    handleZoomMouseMove(evt) {
      if (this.hasAttribute('data-zoom-enabled') && !this.dataset.zoomTrigger && !evt.target.closest('.gallery-zoom-modal')) {
        return;
      }

      const hoverElem = evt.currentTarget;
      const zoomImage = hoverElem.querySelector('.js-zoom-image');

      // Download the zoom image if necessary
      if (zoomImage.dataset.src) {
        this.loadingSpinner.classList.remove('loading-spinner--out');

        const img = new Image();
        img.src = zoomImage.dataset.src;
        img.onload = () => {
          zoomImage.src = img.src;
          hoverElem.classList.remove('media--zoom-not-loaded');
          this.loadingSpinner.classList.add('loading-spinner--out');
        };
        zoomImage.removeAttribute('data-src');
      }

      try {
        const offsetX = evt.offsetX ? evt.offsetX : evt.touches[0].pageX;
        const offsetY = evt.offsetY ? evt.offsetY : evt.touches[0].pageY;
        const x = (offsetX / zoomImage.offsetWidth) * 100;
        const y = (offsetY / zoomImage.offsetHeight) * 100;
        zoomImage.style.objectPosition = `${x}% ${y}%`;
      } catch (err) {
        // Fail silently
      }
    }

    /**
     * Handles 'scroll' events on the main media container.
     */
    handleScroll() {
      const newIndex = Math.round(this.viewer.scrollLeft / this.viewerItemOffset);

      if (newIndex !== this.currentIndex) {
        const viewerItemOffset = this.visibleItems[1].offsetLeft - this.visibleItems[0].offsetLeft;

        // If scroll wasn't caused by a resize event, update the active media.
        if (viewerItemOffset === this.viewerItemOffset) {
          this.customSetActiveMedia(this.visibleItems[newIndex], false);
        }
      }
    }

    /**
     * Handles 'click' events on the controls container.
     * @param {object} evt - Event object.
     */
    handleNavClick(evt) {
      if (!evt.target.matches('.media-ctrl__btn')) return;

      const itemToShow = evt.target === this.nextBtn
        ? this.visibleItems[this.currentIndex + 1]
        : this.visibleItems[this.currentIndex - 1];

      this.viewer.scrollTo({ left: itemToShow.offsetLeft, behavior: 'smooth' });
    }

    /**
     * Handles 'click' events on the thumbnails container.
     * @param {object} evt - Event object.
     */
    handleThumbClick(evt) {
      const thumb = evt.target.closest('[data-image-name]');
      if (!thumb) return;
    
      // Intentar encontrar por data-image-name
      let itemToShow = this.querySelector(`[data-image-name="${thumb.dataset.imageName}"]`);
      
      // Si no se encuentra, intentar por data-media-id como respaldo
      if (!itemToShow && thumb.dataset.mediaId) {
        itemToShow = this.querySelector(`[data-media-id="${thumb.dataset.mediaId}"]`);
      }
      
      // Verificar que se encontró el elemento antes de continuar
      if (!itemToShow) {
        console.warn('No se pudo encontrar el elemento de media correspondiente al thumbnail:', 
                     thumb.dataset.imageName || thumb.dataset.mediaId);
        return;
      }
      
      this.customSetActiveMedia(itemToShow);
      MediaGallery.playActiveMedia(itemToShow);
    }

    /**
     * Handles debounced 'resize' events on the window.
     */
    handleResize() {
      // Reset distance from leading edge of one slide to the next.
      this.viewerItemOffset = this.visibleItems[1].offsetLeft - this.visibleItems[0].offsetLeft;

      if (this.thumbs && this.currentThumb) {
        this.checkThumbVisibilty(this.currentThumb);
      }
    }

    /**
     * Stub for variant-picker calls. Listening to change event instead.
     */
    // eslint-disable-next-line class-methods-use-this
    setActiveMedia() {}

    /**
     * Sets the active media item.
     * @param {Element} mediaItem - Media element to set as active.
     * @param {boolean} [scrollToItem=true] - Scroll to the active media item.
     */
    customSetActiveMedia(mediaItem, scrollToItem = true) {
      if (mediaItem === this.currentItem) return;
      window.pauseAllMedia(this);
      this.currentItem = mediaItem;
      this.currentIndex = this.visibleItems.indexOf(this.currentItem);

      if (this.dataset.layout === 'stacked' && theme.mediaMatches.md) {
        // Update the active class and scroll to the active media
        if (this.stackedUnderline) {
          if (this.previousMediaItem) this.previousMediaItem.classList.remove('is-active');
          mediaItem.classList.add('is-active');
          this.previousMediaItem = mediaItem;
        }

        if (this.stackedScroll !== 'never') {
          const y = mediaItem.getBoundingClientRect().top
            + document.documentElement.scrollTop - 150;

          // If the element is far enough away to scroll to it
          if (Math.abs(y - document.documentElement.scrollTop) > 300) {
            window.scrollTo({
              top: y < 100 ? 0 : y,
              behavior: 'smooth'
            });
          }
        }
        return;
      }

      if (scrollToItem) this.viewer.scrollTo({ left: this.currentItem.offsetLeft });
      if (this.thumbs) this.setActiveThumb();

      if (this.controls) {
        if (this.prevBtn) {
          this.prevBtn.disabled = this.currentIndex === 0;
        }

        if (this.nextBtn) {
          this.nextBtn.disabled = this.currentIndex === this.visibleItems.length - 1;
        }

        if (this.counterCurrent) {
          this.counterCurrent.textContent = this.currentIndex + 1;
        }
      }

      this.announceLiveRegion(this.currentItem, this.currentIndex + 1);

      if (this.xrButton && mediaItem.dataset.mediaType === 'model') {
        this.xrButton.dataset.shopifyModel3dId = mediaItem.dataset.mediaId;
      }
    }

    /**
     * Sets the active thumbnail.
     */
    setActiveThumb() {
      this.currentThumb = this.thumbs.querySelector(
        `[data-media-id="${this.currentItem.dataset.mediaId}"]`
      );
      const btn = this.currentThumb.querySelector('button');

      this.thumbs.querySelectorAll('.media-thumbs__btn').forEach((el) => {
        el.classList.remove('is-active');
        el.removeAttribute('aria-current');
      });

      btn.classList.add('is-active');
      btn.setAttribute('aria-current', 'true');
      this.checkThumbVisibilty(this.currentThumb);
    }

    /**
     * Creates an array of the visible media items.
     */
    setVisibleItems() {
      this.viewerItems = this.querySelectorAll('.media-viewer__item');
      this.visibleItems = Array.from(this.viewerItems).filter((el) => el.clientWidth > 0);
      if (this.counterTotal) {
        this.counterTotal.textContent = this.visibleItems.length;
      }
    }

    /**
     * Ensures a thumbnail is in the visible area of the slider.
     * @param {Element} thumb - Thumb item element.
     */
    checkThumbVisibilty(thumb) {
      const scrollPos = this.thumbs.scrollLeft;
      const lastVisibleThumbOffset = this.thumbs.clientWidth + scrollPos;
      const thumbOffset = thumb.offsetLeft;

      if (thumbOffset + thumb.clientWidth > lastVisibleThumbOffset || thumbOffset < scrollPos) {
        this.thumbs.scrollTo({ left: thumbOffset, behavior: 'smooth' });
      }
    }

    /**
     * Updates the media gallery status.
     * @param {Element} mediaItem - Active media element.
     * @param {number} index - Active media index.
     */
    announceLiveRegion(mediaItem, index) {
      const image = mediaItem.querySelector('.media-viewer img');
      if (!image) return;

      this.liveRegion.setAttribute('aria-hidden', 'false');
      this.liveRegion.innerHTML = theme.strings.imageAvailable.replace('[index]', index);

      setTimeout(() => {
        this.liveRegion.setAttribute('aria-hidden', 'true');
      }, 2000);
    }

    /**
     * Loads the deferred media for the active item.
     * @param {Element} mediaItem - Active media element.
     */
    static playActiveMedia(mediaItem) {
      window.pauseAllMedia();
      const deferredMedia = mediaItem.querySelector('deferred-media');
      if (deferredMedia) deferredMedia.loadContent();
    }
  }

  customElements.define('media-gallery', MediaGallery);
}
