if (!customElements.get('gallery-zoom-open')) {
  class GalleryZoomOpen extends HTMLElement {
    connectedCallback() {
      this.addEventListener('click', this.handleClick.bind(this));
    }

    /**
     * Handle a click event.
     * @param {object} evt - Event object.
     */
    handleClick(evt) {
      const mediaGallery = this.closest('media-gallery');
      const zoomDevice = mediaGallery.dataset.zoomEnabled;

      if (zoomDevice.length === 0 || (zoomDevice === 'mobile' && !theme.mediaMatches.md) || (zoomDevice === 'desktop' && theme.mediaMatches.md)) {
        // Add to document on first open
        if (!mediaGallery.galleryModal.parentElement) {
          document.body.appendChild(mediaGallery.galleryModal);
        }

        mediaGallery.galleryModal.open(evt.currentTarget);
        const zoom = mediaGallery.galleryModal.querySelector('gallery-zoom');
        zoom.init(evt.currentTarget.parentElement.dataset.mediaId);
        zoom.focus();

        evt.preventDefault();
      }
    }
  }

  window.customElements.define('gallery-zoom-open', GalleryZoomOpen);
}

/* eslint-disable max-len */

if (!customElements.get('gallery-zoom')) {
  class GalleryZoom extends HTMLElement {
    connectedCallback() {
      if (!this.initialised) {
        this.initialised = true;

        // ui
        this.classList.add('gallery-zoom--pre-reveal');
        this.zoomContainer = this.querySelector('.gallery-zoom__zoom-container');
        this.thumbContainer = this.querySelector('.gallery-zoom__thumbs');
        this.controlsContainer = this.querySelector('.gallery-zoom__controls');
        this.previousBtn = this.querySelector('.gallery-zoom__prev');
        this.nextBtn = this.querySelector('.gallery-zoom__next');
        this.counterCurrent = this.querySelector('.media-ctrl__current-item');
        this.counterTotal = this.querySelector('.media-ctrl__total-items');
        this.mediaGallery = document.querySelector('.cc-main-product media-gallery');
        this.thumbSlider = this.querySelector('.gallery-zoom__thumb-slider');

        // consts
        this.wheelZoomMultiplier = -0.001;
        this.pinchZoomMultiplier = 0.003;
        this.touchPanModifier = 1.0;

        // vars
        this.currentZoomImage = null;
        this.currentTransform = {
          panX: 0,
          panY: 0,
          zoom: 1
        };
        this.pinchTracking = {
          isTracking: false,
          lastPinchDistance: 0
        };
        this.touchTracking = {
          isTracking: false,
          lastTouchX: 0,
          lastTouchY: 0
        };

        // events
        this.querySelectorAll('.gallery-zoom__thumb').forEach((el) => {
          el.addEventListener('click', this.onThumbClick.bind(this));
        });
        this.addEventListener('touchend', this.stopTrackingTouch.bind(this));
        this.addEventListener('touchmove', this.trackInputMovement.bind(this));
        this.addEventListener('mousemove', this.trackInputMovement.bind(this));
        this.addEventListener('wheel', this.trackWheel.bind(this));
        // prevent pan while swiping thumbnails
        this.thumbContainer.addEventListener('touchmove', (evt) => evt.stopPropagation());
        this.previousBtn.addEventListener('click', this.selectPreviousThumb.bind(this));
        this.nextBtn.addEventListener('click', this.selectNextThumb.bind(this));
        this.zoomContainer.addEventListener('click', this.onZoomContainerClick.bind(this));
        new ResizeObserver(() => this.setInitialImagePosition()).observe(this);
      }

      document.documentElement.classList.add('gallery-zoom-open');
      this.addEventListener('keyup', this.handleKeyup.bind(this));
      setTimeout(() => this.classList.remove('gallery-zoom--pre-reveal'), 10);
    }

    // eslint-disable-next-line class-methods-use-this
    disconnectedCallback() {
      document.documentElement.classList.remove('gallery-zoom-open');
    }

    /**
     * Helper for creating a DOM element.
     * @param {string} type - Element type.
     * @param {string} className - Class to apply to element.
     * @param {Element} appendTo - Element to add to as a child.
     * @param {string} innerHTML - Inner HTML to apply to element.
     * @returns {Element} - The element created.
     */
    static createEl(type, className, appendTo, innerHTML) {
      const el = document.createElement(type);
      el.className = className;
      if (appendTo) {
        appendTo.insertAdjacentElement('beforeend', el);
      }
      if (innerHTML) {
        el.innerHTML = innerHTML;
      }
      return el;
    }

    init(currentMediaId) {
      // Toggle thumbnail visibility based on the current state of media grouping
      if (this.mediaGallery.dataset.mediaGroupingEnabled) {
        let visibleThumbCount = 0;
        Array.from(this.thumbContainer.children).forEach((thumb) => {
          const mediaGalleryImage = this.mediaGallery.querySelector(`.media-viewer__item[data-media-id="${thumb.dataset.mediaId}"]`);
          thumb.hidden = mediaGalleryImage?.style.display === 'none';
          if (!thumb.hidden) visibleThumbCount += 1;
        });
        if (this.counterTotal) this.counterTotal.textContent = visibleThumbCount;
      }

      this.selectThumb(
        [...this.thumbContainer.children].find((el) => el.dataset.mediaId === currentMediaId)
         || this.thumbContainer.firstElementChild
      );
    }

    /**
     * Update pan values based on input event coordinates.
     * @param {number} inputX - Mouse/touch input X.
     * @param {number} inputY - Mouse/touch input Y.
     */
    panZoomImageFromCoordinate(inputX, inputY) {
      // do nothing if the image fits, pan if not
      const doPanX = this.currentZoomImage.clientWidth > this.clientWidth;
      const doPanY = this.currentZoomImage.clientHeight > this.clientHeight;

      if (doPanX || doPanY) {
        const midX = this.clientWidth / 2;
        const midY = this.clientHeight / 2;

        const offsetFromCentreX = inputX - midX;
        const offsetFromCentreY = inputY - midY;

        // the offsetMultipler ensures it can only pan to the edge of the image, no further
        let finalOffsetX = 0;
        let finalOffsetY = 0;

        if (doPanX) {
          const offsetMultiplierX = ((this.currentZoomImage.clientWidth - this.clientWidth) / 2) / midX;
          finalOffsetX = Math.round(-offsetFromCentreX * offsetMultiplierX);
        }
        if (doPanY) {
          const offsetMultiplierY = ((this.currentZoomImage.clientHeight - this.clientHeight) / 2) / midY;
          finalOffsetY = Math.round(-offsetFromCentreY * offsetMultiplierY);
        }

        this.currentTransform.panX = finalOffsetX;
        this.currentTransform.panY = finalOffsetY;
        this.alterCurrentPanBy(0, 0); // sanitise
        this.updateImagePosition();
      }
    }

    /**
     * Update pan values by a delta.
     * @param {number} x - Distance to pan X.
     * @param {number} y - Distance to pan Y.
     */
    alterCurrentPanBy(x, y) {
      this.currentTransform.panX += x;
      // limit offset to keep most of image on screen
      let panXMax = (this.currentZoomImage.naturalWidth * this.currentTransform.zoom - this.clientWidth) / 2.0;
      panXMax = Math.max(panXMax, 0);
      this.currentTransform.panX = Math.min(this.currentTransform.panX, panXMax);
      this.currentTransform.panX = Math.max(this.currentTransform.panX, -panXMax);

      this.currentTransform.panY += y;
      let panYMax = (this.currentZoomImage.naturalHeight * this.currentTransform.zoom - this.clientHeight) / 2.0;
      panYMax = Math.max(panYMax, 0);
      this.currentTransform.panY = Math.min(this.currentTransform.panY, panYMax);
      this.currentTransform.panY = Math.max(this.currentTransform.panY, -panYMax);
      this.updateImagePosition();
    }

    /**
     * Set current zoom image transform to specific values.
     * @param {number} panX - Pan X value.
     * @param {number} panY - Pan Y value.
     * @param {number} zoom - Current zoom amount.
     */
    setCurrentTransform(panX, panY, zoom) {
      this.currentTransform.panX = panX;
      this.currentTransform.panY = panY;
      this.currentTransform.zoom = zoom;
      this.alterCurrentTransformZoomBy(0);
    }

    /**
     * Update zoom amount by a delta.
     * @param {number} delta - Amount to adjust.
     */
    alterCurrentTransformZoomBy(delta) {
      this.currentTransform.zoom += delta;
      // do not zoom out further than fit
      const maxZoomX = this.clientWidth / this.currentZoomImage.naturalWidth;
      const maxZoomY = this.clientHeight / this.currentZoomImage.naturalHeight;
      this.currentTransform.zoom = Math.max(this.currentTransform.zoom, Math.min(maxZoomX, maxZoomY));

      // do not zoom in further than native size
      this.currentTransform.zoom = Math.min(this.currentTransform.zoom, 1.0);

      // reasses pan bounds
      this.alterCurrentPanBy(0, 0);
      this.updateImagePosition();
    }

    /**
     * Position the current image in the centre, zoomed out
     */
    setInitialImagePosition() {
      this.currentZoomImage.style.top = `${this.clientHeight / 2 - this.currentZoomImage.clientHeight / 2}px`;
      this.currentZoomImage.style.left = `${this.clientWidth / 2 - this.currentZoomImage.clientWidth / 2}px`;
      this.setCurrentTransform(0, 0, 0);
    }

    /**
     * Set current zoom image transform based on pan & zoom values.
     */
    updateImagePosition() {
      this.currentZoomImage.style.transform = `translate3d(${this.currentTransform.panX}px, ${this.currentTransform.panY}px, 0) scale(${this.currentTransform.zoom})`;
    }

    /**
     * Select a thumbnail.
     * @param {Element} thumb - Thumbnail to select.
     */
    selectThumb(thumb) {
      let activeThumb;

      [...thumb.parentElement.children].forEach((el) => {
        if (el === thumb) {
          activeThumb = thumb;
          el.classList.add('gallery-zoom__thumb--active');
        } else {
          el.classList.remove('gallery-zoom__thumb--active');
        }
      });

      const visibleThumbs = Array.from(activeThumb.parentElement.children).filter((child) => !child.hidden);
      const activeThumbIndex = visibleThumbs.indexOf(activeThumb);
      if (this.counterCurrent) this.counterCurrent.textContent = activeThumbIndex + 1;

      // If the thumb isn't visible, scroll to it
      this.scrollToThumb(activeThumb);

      this.previousBtn.disabled = activeThumbIndex === 0;
      this.nextBtn.disabled = (activeThumbIndex === (visibleThumbs.length - 1));

      // replace zoom image
      this.zoomContainer.classList.add('gallery-zoom__zoom-container--loading');
      this.currentZoomImage = GalleryZoom.createEl('img', 'gallery-zoom__zoom-image');
      this.currentZoomImage.alt = thumb.querySelector('.gallery-zoom__thumb-img')?.alt;
      this.currentZoomImage.style.visibility = 'hidden';
      this.currentZoomImage.onload = () => {
        this.zoomContainer.classList.remove('gallery-zoom__zoom-container--loading');
        this.currentZoomImage.style.visibility = '';
        this.setInitialImagePosition();
      };
      this.currentZoomImage.src = thumb.dataset.zoomUrl;
      this.zoomContainer.replaceChildren(this.currentZoomImage);
    }

    /**
     * Scrolls the thumbnail slider to the active thumbnail if necessary
     * @param {Element} thumb - Thumbnail to scroll to.
     */
    scrollToThumb(thumb) {
      const thumbSliderRect = this.thumbSlider.getBoundingClientRect();
      const thumbRect = thumb.getBoundingClientRect();

      const thumbLeft = thumbRect.left - thumbSliderRect.left;
      const thumbRight = thumbRect.right - thumbSliderRect.right;

      if (thumbLeft < 0) {
        this.thumbSlider.scrollLeft += thumbLeft - (this.thumbSlider.clientWidth - thumbRect.width);
      } else if (thumbRight > 0) {
        this.thumbSlider.scrollLeft += thumbRight + (this.thumbSlider.clientWidth - thumbRect.width);
      }
    }

    /**
     * Select previous thumbnail.
     * @param {Event} evt - Click event, if triggered by pagination.
     */
    selectPreviousThumb(evt) {
      if (evt) evt.preventDefault();
      if (this.thumbContainer.childElementCount < 2) return;

      let previous = this.thumbContainer.querySelector('.gallery-zoom__thumb--active').previousElementSibling;
      while (!previous || !previous.offsetParent) {
        if (!previous) {
          previous = this.thumbContainer.lastElementChild;
        } else {
          previous = previous.previousElementSibling;
        }
      }
      this.selectThumb(previous);
    }

    /**
     * Select next thumbnail.
     * @param {Event} evt - Click event, if triggered by pagination.
     */
    selectNextThumb(evt) {
      if (evt) evt.preventDefault();
      if (this.thumbContainer.childElementCount < 2) return;

      let next = this.thumbContainer.querySelector('.gallery-zoom__thumb--active').nextElementSibling;
      while (!next || !next.offsetParent) {
        if (!next) {
          next = this.thumbContainer.firstElementChild;
        } else {
          next = next.nextElementSibling;
        }
      }
      this.selectThumb(next);
    }

    /**
     * Call to stop tracking touch events.
     */
    stopTrackingTouch() {
      this.pinchTracking.isTracking = false;
      this.touchTracking.isTracking = false;
    }

    /**
     * Handle mouse and touch events.
     * @param {object} evt - Event object.
     */
    trackInputMovement(evt) {
      evt.preventDefault();
      if (evt.type === 'touchmove' && evt.touches.length > 0) {
        // pan
        const touch1 = evt.touches[0];
        if (!this.touchTracking.isTracking) {
          this.touchTracking.isTracking = true;
          this.touchTracking.lastTouchX = touch1.clientX;
          this.touchTracking.lastTouchY = touch1.clientY;
        } else {
          this.alterCurrentPanBy(
            (touch1.clientX - this.touchTracking.lastTouchX) * this.touchPanModifier,
            (touch1.clientY - this.touchTracking.lastTouchY) * this.touchPanModifier
          );
          this.touchTracking.lastTouchX = touch1.clientX;
          this.touchTracking.lastTouchY = touch1.clientY;
        }

        if (evt.touches.length === 2) {
          // pinch
          const touch2 = evt.touches[1];
          const pinchDistance = Math.sqrt((touch1.clientX - touch2.clientX) ** 2 + (touch1.clientY - touch2.clientY) ** 2);
          if (!this.pinchTracking.isTracking) {
            this.pinchTracking.lastPinchDistance = pinchDistance;
            this.pinchTracking.isTracking = true;
          } else {
            const pinchDelta = pinchDistance - this.pinchTracking.lastPinchDistance;
            this.alterCurrentTransformZoomBy(pinchDelta * this.pinchZoomMultiplier);
            this.pinchTracking.lastPinchDistance = pinchDistance;
          }
        } else {
          this.pinchTracking.isTracking = false;
        }
      } else {
        // mousemove
        this.panZoomImageFromCoordinate(evt.clientX, evt.clientY);
      }
    }

    /**
     * Handle mouse wheel scroll - use for zoom.
     * @param {object} evt - Event object.
     */
    trackWheel(evt) {
      evt.preventDefault();
      if (evt.deltaY !== 0) {
        this.alterCurrentTransformZoomBy(evt.deltaY * this.wheelZoomMultiplier);
      }
    }

    /**
     * Handle click on a thumbnail image.
     * @param {object} evt - Event object.
     */
    onThumbClick(evt) {
      evt.preventDefault();
      this.selectThumb(evt.currentTarget);
    }

    /**
     * Handle click on the main zoom image. (Toggle zoom in/out.)
     * @param {object} evt - Event object.
     */
    onZoomContainerClick(evt) {
      evt.preventDefault();

      if (this.currentTransform.zoom === 1.0) {
        this.currentTransform.zoom = 0;
        this.alterCurrentTransformZoomBy(0);
      } else {
        this.currentTransform.zoom = 1;
        this.alterCurrentTransformZoomBy(0);
        this.panZoomImageFromCoordinate(evt.clientX, evt.clientY);
      }
    }

    /**
     * Handle key events.
     * @param {object} evt - Event object.
     */
    handleKeyup(evt) {
      switch (evt.key) {
        case 'ArrowLeft':
          evt.preventDefault();
          this.selectPreviousThumb();
          break;
        case 'ArrowRight':
          evt.preventDefault();
          this.selectNextThumb();
          break;
      }
    }
  }

  window.customElements.define('gallery-zoom', GalleryZoom);
}
