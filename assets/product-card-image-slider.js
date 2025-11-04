/* global CarouselSlider */

  const path = window.location.pathname;
  const collectionsMatch = path.match(/\/collections\/([^\/]+)/);
  const isOutlet = collectionsMatch ? collectionsMatch[1] === 'outlet' : false;

if (!customElements.get('product-card-image-slider')) {
  
  customElements.whenDefined('carousel-slider').then(() => {
    class ProductCardImageSlider extends CarouselSlider {
      constructor() {
        super();
        this.productCard = this.closest('product-card');
        this.productCardSwatches = this.productCard ? this.productCard.querySelectorAll('.card__swatches .opt-btn') : null;
        this.slides = this.querySelectorAll('.slider__item');
        this.colorGroupingEnabled = this.hasAttribute('data-color-grouping-enabled') || true; // Habilitado por defecto

        if (this.productCard) {
          this.productCard.addEventListener('change', this.handleSwatchChange.bind(this));
        }
      }

      init() {
        super.init();

        this.slider.addEventListener('scroll', this.scrollInProgress.bind(this));

        // If swatches are enabled, mark the swatch anchors in the slideshow
        if (this.productCardSwatches && this.productCardSwatches.length > 0) {
          const activeSlide = this.querySelector('.slider__item[aria-current]');
          const activeSwatchId = this.productCard.querySelector('.card__swatches .opt-btn:checked')?.dataset.mediaId || activeSlide?.dataset.mediaId;
          let activeSwatchSlide;

          if (activeSwatchId) {
            this.productCardSwatches.forEach((swatch) => {
              const swatchSlide = this.querySelector(`[data-media-id="${swatch.dataset.mediaId}"]`);
              if (swatchSlide) {
                swatchSlide.setAttribute('data-swatch-anchor', 'true');

                // Set the active set of slideshow images
                if (swatchSlide.dataset.mediaId === activeSwatchId) {
                  if (activeSlide) activeSlide.removeAttribute('aria-current');
                  swatchSlide.setAttribute('aria-current', 'true');
                  activeSwatchSlide = swatchSlide;
                }
              }
            });
          }

          // Implementar agrupamiento por color
          if (this.colorGroupingEnabled) {
            // PENDIENTE: Al inicializar no hay ninguna chequeada
            const checkedSwatch = this.productCard.querySelector('.card__swatches .opt-btn:checked');
            if (checkedSwatch) {
              const colorCode = this.getColorCodeFromSwatch(checkedSwatch.value);
              
              if (colorCode) {
                this.setActiveColorGroup(colorCode);
              }
            }
          } else if (activeSwatchSlide) {
            this.handleSwatchChange(null, activeSwatchSlide.dataset.mediaId);
          }
        } else {
          // Show the current slider item
          const activeSlide = this.querySelector('.slider__item[aria-current]');
          if (activeSlide) {
            this.handleSwatchChange(null, activeSlide.dataset.mediaId);
          } else if (this.slider.slides && this.slider.slides.length > 0) {
            this.slider.slides[0].setAttribute('aria-current', 'true');
          }
        }
        
        // Force a check of button states
        this.setButtonStates();

        // Nuevo: Usar el Helper para actualizar los enlaces con la variante
        this.updateLinksWithVariant();
      }

      /**
       * Extrae el código de color de un nombre de imagen.
       * @param {string} imageName - Nombre de la imagen (ej: BOP597-08-XS.jpg, BOP597-23-XS-1.jpg)
       * @returns {string|null} - El código de color o null si no se encuentra
       */
      extractColorCode(imageName) {
        if (!imageName) return null;
        
        // Extraer solo el nombre del archivo sin extensión
        const fileName = imageName.split('/').pop().split('.')[0];
        
        // Buscar el patrón MODELO-CODIGO donde CODIGO son dígitos
        const matches = fileName.match(/^[^-]+-(\d+)/);
        return matches ? matches[1] : null;
      }

      /**
       * Obtiene el código de color de un valor de swatch.
       * @param {string} swatchValue - Valor del swatch (ej: "23 - INDIGO", "08 - NEW ROYAL")
       * @returns {string|null} - Código de color o null si no se encuentra
       */
      getColorCodeFromSwatch(swatchValue) {
        if (!swatchValue) return null;
        
        // El código está al inicio seguido de " - "
        const matches = swatchValue.match(/^(\d+)\s*-/);
        return matches ? matches[1] : null;
      }

      /**
       * Crea un mapa de agrupamiento por códigos de color
       * @returns {object} - Objeto con grupos de imágenes por código de color
       */
      getColorGroupMap() {
        if (!this.colorGroupMap) {
          this.colorGroupMap = {
            groups: {}
          };

          // Iterar por cada slide para agrupar por código de color
          this.slides.forEach((slide) => {
            const mediaId = slide.dataset.mediaId;
            if (!mediaId) return;

            // Buscar imagen dentro del slide para obtener el src
            const img = slide.querySelector('img');
            if (!img) return;

            const imageSrc = img.getAttribute('src') || img.getAttribute('data-src');
            if (!imageSrc) return;

            // Extraer el código de color del nombre de la imagen
            const colorCode = this.extractColorCode(imageSrc);
            if (!colorCode) return; // Ignorar imágenes que no cumplan el patrón

            // Crear el grupo para este código de color si no existe
            if (!this.colorGroupMap.groups[colorCode]) {
              this.colorGroupMap.groups[colorCode] = {
                name: colorCode,
                slides: []
              };
            }

            // Añadir el slide al grupo correspondiente
            this.colorGroupMap.groups[colorCode].slides.push(slide);
          });

          // Método helper para encontrar el grupo de un slide
          this.colorGroupMap.groupFromSlide = (slide) => {
            if (!slide) return null;

            const img = slide.querySelector('img');
            if (!img) return null;

            const imageSrc = img.getAttribute('src') || img.getAttribute('data-src');
            if (!imageSrc) return null;

            const slideColorCode = this.extractColorCode(imageSrc);
            if (!slideColorCode || !this.colorGroupMap.groups[slideColorCode]) {
              return null;
            }

            return this.colorGroupMap.groups[slideColorCode];
          };
        }

        return this.colorGroupMap;
      }

      /**
       * Establece el grupo de color activo y oculta el resto
       * @param {string} colorCode - Código de color a mostrar
       */
      setActiveColorGroup(colorCode) {
        const colorGroupMap = this.getColorGroupMap();
        const selectedGroup = colorGroupMap.groups[colorCode];

        if (selectedGroup) {
          // Ocultar todas las slides
          this.slides.forEach((slide) => {
            slide.style.display = 'none';
            slide.removeAttribute('hidden'); // Limpiar hidden anterior
          });

          // Mostrar solo las slides del grupo seleccionado
          selectedGroup.slides.forEach((slide) => {
            slide.style.display = '';
          });

          // Actualizar el estado de los botones
          this.setButtonStates();

          // Navegar a la primera imagen del grupo
          if (selectedGroup.slides.length > 0) {
            const firstSlide = selectedGroup.slides[0];
            
            // Remover aria-current de todas las slides
            this.slides.forEach(slide => slide.removeAttribute('aria-current'));
            
            // Establecer la primera del grupo como actual
            firstSlide.setAttribute('aria-current', 'true');
            
            // Desplazar a la primera imagen del grupo
            const left = firstSlide.offsetLeft;
            this.slider.scrollTo({ left, behavior: 'instant' });
          }

          this.currentColorGroup = selectedGroup;
        }
      }

      /**
       * Helper
       * Actualiza los enlaces de productos con el parámetro de variante cuando se está en la colección outlet
       */
      updateLinksWithVariant() {
        // Early return if not in outlet collection
        if (!isOutlet) {
          return;
        }

        // Find the checked input (selected variant)
        const checkedInput = this.productCard?.querySelector('.card__swatches .opt-btn:checked');
        
        if (!checkedInput) {
          console.warn('ProductCardImageSlider: No checked variant found in outlet product');
          return;
        }

        // Get the variant ID from the checked input
        const variantId = checkedInput.dataset.variantId;
        
        if (!variantId) {
          console.warn('ProductCardImageSlider: No variant ID found in checked input');
          return;
        }

        // Find all links within this product card slider
        const productLinks = this.querySelectorAll('a[href]');
        
        productLinks.forEach(link => {
          const currentHref = link.getAttribute('href');
          
          if (currentHref) {
            // Add the variant parameter (URLs are clean at initialization)
            const newHref = `${currentHref}?variant=${variantId}`;
            link.setAttribute('href', newHref);
          }
        });
      }

      /**
       * Updates the visibility of slides based on the state of card swatches.
       * @param {string} mediaId - The media ID to match against the slides.
       */
      updateSlideVisibility(mediaId) {
        // Si el agrupamiento por color está habilitado, no usar la lógica antigua
        if (this.colorGroupingEnabled) {
          return;
        }

        let hideSlide = true;
        let foundMediaId = false;
        this.slides.forEach((slide) => {
          if (!foundMediaId && slide.getAttribute('data-media-id') === mediaId) {
            hideSlide = false;
            foundMediaId = true;
          } else if (foundMediaId && slide.hasAttribute('data-swatch-anchor')) {
            hideSlide = true;
          }

          slide.toggleAttribute('hidden', hideSlide);
        });

        this.setButtonStates();
      }

      /**
       * Handles 'change' events in the product card swatches.
       * @param {object} evt - Event object.
       * @param {string} mediaId - The media ID to match against the slides.
       */
      handleSwatchChange(evt, mediaId) {
        if (this.colorGroupingEnabled) {
          // Nueva lógica de agrupamiento por color
          const swatchValue = evt?.target?.value;
          if (swatchValue) {
            const colorCode = this.getColorCodeFromSwatch(swatchValue);
            if (colorCode) {
              this.setActiveColorGroup(colorCode);
              return;
            }
          }
        }

        // Lógica original como fallback
        const swatchMediaId = evt?.target?.dataset?.mediaId || mediaId;
        if (swatchMediaId) {
          this.updateSlideVisibility(swatchMediaId);

          const variantMedia = this.querySelector(`[data-media-id="${swatchMediaId}"]`);
          if (variantMedia) {
            const left = variantMedia.closest('.slider__item').offsetLeft;
            this.slider.scrollTo({ left, behavior: 'instant' });
          }
        }
      }

      /**
       * Sets the disabled state of the nav buttons.
       */
      setButtonStates() {
        if (!this.prevBtn && !this.nextBtn) {
          // Buscar los botones en caso de tabs
          const sliderId = this.slider.id;
          if (sliderId) {
            const container = this.closest('.carousel');
            if (container) {
              this.prevBtn = container.querySelector(`button[name="prev"][aria-controls="${sliderId}"]`);
              this.nextBtn = container.querySelector(`button[name="next"][aria-controls="${sliderId}"]`);
            }
          }
          
          if (!this.prevBtn && !this.nextBtn) {
            return;
          }
        }

        const currentSlideIndex = Math.round(this.slider.scrollLeft / this.slideSpan) + 1;
        
        // Si el agrupamiento por color está habilitado, contar solo slides visibles
        let visibleSlideCount;
        if (this.colorGroupingEnabled && this.currentColorGroup) {
          visibleSlideCount = this.currentColorGroup.slides.length;
        } else {
          visibleSlideCount = Array.from(this.slides).filter((slide) => slide.hidden !== true).length;
        }

        this.prevBtn.disabled = currentSlideIndex === 1
          || (this.getSlideVisibility(this.slides[0]) && this.slider.scrollLeft === 0);
        this.nextBtn.disabled = visibleSlideCount === currentSlideIndex
          || this.getSlideVisibility(this.slides[this.slides.length - 1]);
      }

      /**
       * Handles 'scroll' events on the slider element.
       */
      scrollInProgress() {
        this.slider.querySelector('[aria-current]')?.removeAttribute('aria-current');
      }

      /**
       * Handles 'scroll' events on the slider element.
       */
      handleScroll() {
        super.handleScroll();
        if (this.slides && this.slides.length > 0 && this.currentIndex < this.slides.length) {
          this.slides[this.currentIndex].setAttribute('aria-current', 'true');
        }
        // Aseguramos que los botones se actualicen
        this.setButtonStates();
      }
    }

    customElements.define('product-card-image-slider', ProductCardImageSlider);
  });
}

// Añadir manejador de pestañas
document.addEventListener('DOMContentLoaded', function() {
  // Inicializar el sistema de pestañas
  const tabContainers = document.querySelectorAll('[data-upng-tabs]');
  
  tabContainers.forEach(container => {
    const tabButtons = container.querySelectorAll('[role="tab"]');
    const tabPanels = container.querySelectorAll('[role="tabpanel"]');
    
    // Manejar el clic en las pestañas
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabIndex = parseInt(button.dataset.tabIndex);
        
        // Actualizar estado de las pestañas
        tabButtons.forEach((btn, index) => {
          const isActive = index === tabIndex;
          btn.classList.toggle('active', isActive);
          btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
          btn.setAttribute('tabindex', isActive ? '0' : '-1');
        });
        
        // Actualizar contenido de las pestañas
        tabPanels.forEach((panel, index) => {
          const isActive = index === tabIndex;
          panel.classList.toggle('active', isActive);
          panel.hidden = !isActive;
          
          // Inicializar carrusel en la pestaña activa
          if (isActive) {
            initTabCarousel(panel);
          }
        });
      });
      
      // Navegación con teclado
      button.addEventListener('keydown', (event) => {
        const tabsArray = Array.from(tabButtons);
        const index = tabsArray.indexOf(event.currentTarget);
        let nextTabIndex;
        
        switch (event.key) {
          case 'ArrowLeft':
            nextTabIndex = index === 0 ? tabsArray.length - 1 : index - 1;
            tabsArray[nextTabIndex].click();
            tabsArray[nextTabIndex].focus();
            break;
          case 'ArrowRight':
            nextTabIndex = index === tabsArray.length - 1 ? 0 : index + 1;
            tabsArray[nextTabIndex].click();
            tabsArray[nextTabIndex].focus();
            break;
          case 'Home':
            tabsArray[0].click();
            tabsArray[0].focus();
            break;
          case 'End':
            tabsArray[tabsArray.length - 1].click();
            tabsArray[tabsArray.length - 1].focus();
            break;
        }
      });
    });
    
    // Inicializar el carrusel de la primera pestaña
    if (tabPanels.length > 0) {
      initTabCarousel(tabPanels[0]);
    }
  });
});

// Función para inicializar un carrusel en una pestaña
function initTabCarousel(tabPanel) {
  if (!tabPanel) return;
  
  const carousel = tabPanel.querySelector('carousel-slider');
  if (carousel) {
    if (carousel.hasAttribute('inactive')) {
      carousel.removeAttribute('inactive');
      if (typeof carousel.connectedCallback === 'function') {
        carousel.connectedCallback();
      }
      
      // Dar tiempo para que el carrusel se inicialice y luego forzar una actualización de estado
      setTimeout(() => {
        const carouselInstance = carousel.__proto__.constructor;
        if (carouselInstance && typeof carouselInstance.prototype.setButtonStates === 'function') {
          if (typeof carousel.setButtonStates === 'function') {
            carousel.setButtonStates();
          }
        }
        
        // Forzar un evento de desplazamiento para actualizar los botones
        const slider = carousel.querySelector('.slider');
        if (slider) {
          slider.dispatchEvent(new Event('scroll'));
        }
      }, 100);
    } else {
      // Forzar actualización del estado del carrusel
      const slider = carousel.querySelector('.slider');
      if (slider) {
        slider.dispatchEvent(new Event('scroll'));
      }
    }
  }
}