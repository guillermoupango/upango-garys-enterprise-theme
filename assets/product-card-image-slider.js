/* global CarouselSlider */

if (!customElements.get('product-card-image-slider')) {
  customElements.whenDefined('carousel-slider').then(() => {
    class ProductCardImageSlider extends CarouselSlider {
      constructor() {
        super();
        this.productCard = this.closest('product-card');
        this.productCardSwatches = this.productCard.querySelectorAll('.card__swatches .opt-btn');
        this.slides = this.querySelectorAll('.slider__item');

        this.productCard.addEventListener('change', this.handleSwatchChange.bind(this));
      }

      init() {
        super.init();

        this.slider.addEventListener('scroll', this.scrollInProgress.bind(this));

        // If swatches are enabled, mark the swatch anchors in the slideshow
        if (this.productCardSwatches) {
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
                  activeSlide.removeAttribute('aria-current');
                  swatchSlide.setAttribute('aria-current', 'true');
                  activeSwatchSlide = swatchSlide;
                }
              }
            });
          }

          if (activeSwatchSlide) this.handleSwatchChange(null, activeSwatchSlide.dataset.mediaId);
        } else {
          // Show the current slider item
          const activeSlide = this.querySelector('.slider__item[aria-current]');
          if (activeSlide) {
            this.handleSwatchChange(null, activeSlide.dataset.mediaId);
          } else {
            this.slider.slides[1]?.setAttribute('aria-current', 'true');
          }
        }
      }

      /**
       * Updates the visibility of slides based on the state of card swatches.
       * @param {string} mediaId - The media ID to match against the slides.
       */
      updateSlideVisibility(mediaId) {
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
        const swatchMediaId = evt?.target.dataset.mediaId || mediaId;
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
          return;
        }

        const currentSlideIndex = Math.round(this.slider.scrollLeft / this.slideSpan) + 1;
        const visibleSlideCount = this.slides.filter((slide) => slide.hidden !== true).length;

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
        this.slides[this.currentIndex].setAttribute('aria-current', 'true');
      }
    }

    customElements.define('product-card-image-slider', ProductCardImageSlider);
  });
}
