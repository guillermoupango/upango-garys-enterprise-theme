/**
 * Polyfills :focus-visible for non supporting browsers (Safari < 15.4).
 */
function focusVisiblePolyfill() {
  const navKeys = ['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Space', 'Escape', 'Home', 'End', 'PageUp', 'PageDown'];
  let currentFocusedElement = null;
  let mouseClick = null;

  window.addEventListener('keydown', (evt) => {
    if (navKeys.includes(evt.code)) mouseClick = false;
  });

  window.addEventListener('mousedown', () => {
    mouseClick = true;
  });

  window.addEventListener('focus', () => {
    if (currentFocusedElement) currentFocusedElement.classList.remove('is-focused');
    if (mouseClick) return;

    currentFocusedElement = document.activeElement;
    currentFocusedElement.classList.add('is-focused');
  }, true);
}

// Add polyfill if :focus-visible is not supported.
try {
  document.querySelector(':focus-visible');
} catch (e) {
  focusVisiblePolyfill();
}

/**
 * Creates a 'mediaMatches' object from the media queries specified in the theme,
 * and adds listeners for each media query. If a breakpoint is crossed, the mediaMatches
 * values are updated and a 'on:breakpoint-change' event is dispatched.
 */
(() => {
  const { mediaQueries } = theme;
  if (!mediaQueries) return;

  const mqKeys = Object.keys(mediaQueries);
  const mqLists = {};
  theme.mediaMatches = {};

  /**
   * Handles a media query (breakpoint) change.
   */
  const handleMqChange = () => {
    const newMatches = mqKeys.reduce((acc, media) => {
      acc[media] = !!(mqLists[media] && mqLists[media].matches);
      return acc;
    }, {});

    // Update mediaMatches values after breakpoint change.
    Object.keys(newMatches).forEach((key) => {
      theme.mediaMatches[key] = newMatches[key];
    });

    window.dispatchEvent(new CustomEvent('on:breakpoint-change'));
  };

  mqKeys.forEach((mq) => {
    // Create mqList object for each media query.
    mqLists[mq] = window.matchMedia(mediaQueries[mq]);

    // Get initial matches for each query.
    theme.mediaMatches[mq] = mqLists[mq].matches;

    // Add an event listener to each query.
    try {
      mqLists[mq].addEventListener('change', handleMqChange);
    } catch (err1) {
      // Fallback for legacy browsers (Safari < 14).
      mqLists[mq].addListener(handleMqChange);
    }
  });
})();

/**
 * Returns a function that as long as it continues to be invoked, won't be triggered.
 * @param {Function} fn - Callback function.
 * @param {number} [wait=300] - Delay (in milliseconds).
 * @returns {Function}
 */
function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Sets a 'viewport-height' custom property on the root element.
 */
function setViewportHeight() {
  document.documentElement.style.setProperty('--viewport-height', `${window.innerHeight}px`);
}

/**
 * Sets a 'header-height' custom property on the root element.
 */
function setHeaderHeight() {
  const header = document.getElementById('shopify-section-header');
  if (!header) return;
  let height = header.offsetHeight;

  // Add announcement bar height (if shown).
  const announcement = document.getElementById('shopify-section-announcement');
  if (announcement) height += announcement.offsetHeight;

  document.documentElement.style.setProperty('--header-height', `${height}px`);
}

/**
 * Sets a 'scrollbar-width' custom property on the root element.
 */
function setScrollbarWidth() {
  document.documentElement.style.setProperty(
    '--scrollbar-width',
    `${window.innerWidth - document.documentElement.clientWidth}px`
  );
}

/**
 * Sets the dimension variables.
 */
function setDimensionVariables() {
  setViewportHeight();
  setHeaderHeight();
  setScrollbarWidth();
}

// Set the dimension variables once the DOM is loaded
document.addEventListener('DOMContentLoaded', setDimensionVariables);

// Update the dimension variables if viewport resized.
window.addEventListener('resize', debounce(setDimensionVariables, 400));

// iOS alters screen width without resize event, if unexpectedly wide content is found
setTimeout(setViewportHeight, 3000);

/**
 * Adds an observer to initialise a script when an element is scrolled into view.
 * @param {Element} element - Element to observe.
 * @param {Function} callback - Function to call when element is scrolled into view.
 * @param {number} [threshold=500] - Distance from viewport (in pixels) to trigger init.
 */
function initLazyScript(element, callback, threshold = 500) {
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (typeof callback === 'function') {
            callback();
            observer.unobserve(entry.target);
          }
        }
      });
    }, { rootMargin: `0px 0px ${threshold}px 0px` });

    io.observe(element);
  } else {
    callback();
  }
}

/**
 * Pauses all media (videos/models) within an element.
 * @param {Element} [el=document] - Element to pause media within.
 */
function pauseAllMedia(el = document) {
  el.querySelectorAll('.js-youtube, .js-vimeo, video').forEach((video) => {
    const component = video.closest('video-component');
    if (component && component.dataset.background === 'true') return;

    if (video.matches('.js-youtube')) {
      video.contentWindow.postMessage('{ "event": "command", "func": "pauseVideo", "args": "" }', '*');
    } else if (video.matches('.js-vimeo')) {
      video.contentWindow.postMessage('{ "method": "pause" }', '*');
    } else {
      video.pause();
    }
  });

  el.querySelectorAll('product-model').forEach((model) => {
    if (model.modelViewerUI) model.modelViewerUI.pause();
  });
}

class DeferredMedia extends HTMLElement {
  constructor() {
    super();

    const loadBtn = this.querySelector('.js-load-media');
    if (loadBtn) {
      loadBtn.addEventListener('click', this.loadContent.bind(this));
    } else {
      this.addObserver();
    }
  }

  /**
   * Adds an Intersection Observer to load the content when viewport scroll is near
   */
  addObserver() {
    if ('IntersectionObserver' in window === false) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          this.loadContent(false, false, 'observer');
          observer.unobserve(this);
        }
      });
    }, { rootMargin: '0px 0px 1000px 0px' });

    observer.observe(this);
  }

  /**
   * Loads the deferred media.
   * @param {boolean} [focus=true] - Focus the deferred media element after loading.
   * @param {boolean} [pause=true] - Whether to pause all media after loading.
   * @param {string} [loadTrigger='click'] - The action that caused the deferred content to load.
   */
  loadContent(focus = true, pause = true, loadTrigger = 'click') {
    if (pause) pauseAllMedia();
    if (this.getAttribute('loaded') !== null) return;

    this.loadTrigger = loadTrigger;
    const content = this.querySelector('template').content.firstElementChild.cloneNode(true);
    this.appendChild(content);
    this.setAttribute('loaded', '');

    const deferredEl = this.querySelector('video, model-viewer, iframe');
    if (deferredEl && focus) deferredEl.focus();
  }
}

customElements.define('deferred-media', DeferredMedia);

class DetailsDisclosure extends HTMLElement {
  constructor() {
    super();
    this.disclosure = this.querySelector('details');
    this.toggle = this.querySelector('summary');
    this.panel = this.toggle.nextElementSibling;
    this.init();
  }

  init() {
    // Check if the content element has a CSS transition.
    if (window.getComputedStyle(this.panel).transitionDuration !== '0s') {
      this.toggle.addEventListener('click', this.handleToggle.bind(this));
      this.disclosure.addEventListener('transitionend', this.handleTransitionEnd.bind(this));
    }
  }

  /**
   * Handles 'click' events on the summary element.
   * @param {object} evt - Event object.
   */
  handleToggle(evt) {
    evt.preventDefault();

    if (!this.disclosure.open) {
      this.open();
    } else {
      this.close();
    }
  }

  /**
   * Handles 'transitionend' events on the details element.
   * @param {object} evt - Event object.
   */
  handleTransitionEnd(evt) {
    if (evt.target !== this.panel) return;

    if (this.disclosure.classList.contains('is-closing')) {
      this.disclosure.classList.remove('is-closing');
      this.disclosure.open = false;
    }

    this.panel.removeAttribute('style');
  }

  /**
   * Adds inline 'height' style to the content element, to trigger open transition.
   */
  addContentHeight() {
    this.panel.style.height = `${this.panel.scrollHeight}px`;
  }

  /**
   * Opens the details element.
   */
  open() {
    // Set content 'height' to zero before opening the details element.
    this.panel.style.height = '0';

    // Open the details element
    this.disclosure.open = true;

    // Set content 'height' to its scroll height, to enable CSS transition.
    this.addContentHeight();
  }

  /**
   * Closes the details element.
   */
  close() {
    // Set content height to its scroll height, to enable transition to zero.
    this.addContentHeight();

    // Add class to enable styling of content or toggle icon before or during close transition.
    this.disclosure.classList.add('is-closing');

    // Set content height to zero to trigger the transition.
    // Slight delay required to allow scroll height to be applied before changing to '0'.
    setTimeout(() => {
      this.panel.style.height = '0';
    });
  }
}

customElements.define('details-disclosure', DetailsDisclosure);

const trapFocusHandlers = {};

/**
 * Removes focus trap event listeners and optionally focuses an element.
 * @param {Element} [elementToFocus=null] - Element to focus when trap is removed.
 */
function removeTrapFocus(elementToFocus = null) {
  document.removeEventListener('focusin', trapFocusHandlers.focusin);
  document.removeEventListener('focusout', trapFocusHandlers.focusout);
  document.removeEventListener('keydown', trapFocusHandlers.keydown);

  if (elementToFocus) elementToFocus.focus();
}

/**
 * Traps focus within a container, e.g. modal or side drawer.
 * @param {Element} container - Container element to trap focus within.
 * @param {Element} [elementToFocus=container] - Initial element to focus when trap is applied.
 */
function trapFocus(container, elementToFocus = container) {
  const focusableEls = Array.from(
    container.querySelectorAll('summary, a[href], area[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), object, iframe, audio[controls], video[controls], [tabindex]:not([tabindex^="-"])')
  );

  const firstEl = focusableEls[0];
  const lastEl = focusableEls[focusableEls.length - 1];

  removeTrapFocus();

  trapFocusHandlers.focusin = (evt) => {
    if (evt.target !== container && evt.target !== lastEl && evt.target !== firstEl) return;
    document.addEventListener('keydown', trapFocusHandlers.keydown);
  };

  trapFocusHandlers.focusout = () => {
    document.removeEventListener('keydown', trapFocusHandlers.keydown);
  };

  trapFocusHandlers.keydown = (evt) => {
    if (evt.code !== 'Tab') return;

    // If tab pressed on last focusable element, focus the first element.
    if (evt.target === lastEl && !evt.shiftKey) {
      evt.preventDefault();
      firstEl.focus();
    }

    //  If shift + tab pressed on the first focusable element, focus the last element.
    if ((evt.target === container || evt.target === firstEl) && evt.shiftKey) {
      evt.preventDefault();
      lastEl.focus();
    }
  };

  document.addEventListener('focusout', trapFocusHandlers.focusout);
  document.addEventListener('focusin', trapFocusHandlers.focusin);

  (elementToFocus || container).focus();
}

class Modal extends HTMLElement {
  constructor() {
    super();
    this.addEventListener('click', this.handleClick.bind(this));
  }

  /**
   * Handles 'click' events on the modal.
   * @param {object} evt - Event object.
   */
  handleClick(evt) {
    if (evt.target !== this && !evt.target.matches('.js-close-modal')) return;
    this.close();
  }

  /**
   * Opens the modal.
   * @param {Element} opener - Modal opener element.
   */
  open(opener) {
    // Prevent page behind from scrolling when side drawer is open
    this.scrollY = window.scrollY;
    document.body.classList.add('fixed');
    document.body.style.top = `-${this.scrollY}px`;

    this.setAttribute('open', '');
    this.openedBy = opener;

    trapFocus(this);
    window.pauseAllMedia();

    // Add event handler (so the bound event listener can be removed).
    this.keyupHandler = (evt) => evt.key === 'Escape' && this.close();

    // Add event listener (for while modal is open).
    this.addEventListener('keyup', this.keyupHandler);

    // Wrap tables in a '.scrollable-table' element for a better mobile experience.
    this.querySelectorAll('table').forEach((table) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'scrollable-table';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  }

  /**
   * Closes the modal.
   */
  close() {
    // Restore page position and scroll behaviour.
    document.body.style.top = '';
    document.body.classList.remove('fixed');
    window.scrollTo(0, this.scrollY);

    this.removeAttribute('open');

    removeTrapFocus(this.openedBy);
    window.pauseAllMedia();

    // Remove event listener added on modal opening.
    this.removeEventListener('keyup', this.keyupHandler);
  }
}

customElements.define('modal-dialog', Modal);

class ModalOpener extends HTMLElement {
  constructor() {
    super();

    const button = this.querySelector('button');
    if (!button) return;

    button.addEventListener('click', () => {
      const modal = document.getElementById(this.dataset.modal);
      if (modal) modal.open(button);
    });
  }
}

customElements.define('modal-opener', ModalOpener);

class ProductCard extends HTMLElement {
  constructor() {
    super();
    window.initLazyScript(this, this.init.bind(this));
  }

  init() {
    this.images = this.querySelectorAll('.card__main-image');
    this.links = this.querySelectorAll('.js-prod-link');
    this.quickAddBtn = this.querySelector('.js-quick-add');
    this.carouselSlider = this.querySelector('product-card-image-slider');

    if (this.quickAddBtn) {
      this.productUrl = this.quickAddBtn.dataset.productUrl;
    } else if (this.links.length) {
      this.productUrl = this.links[0].href;
    }

    this.addEventListener('change', this.handleSwatchChange.bind(this));
  }

  /**
   * Handles 'change' events in the product card swatches.
   * @param {object} evt - Event object.
   */
  handleSwatchChange(evt) {
    if (!evt.target.matches('.opt-btn')) return;

    // Swap current card image to selected variant image.
    if (evt.target.dataset.mediaId && !this.carouselSlider) {
      const variantMedia = this.querySelector(`[data-media-id="${evt.target.dataset.mediaId}"]`);

      if (variantMedia) {
        this.images.forEach((image) => { image.hidden = true; });
        variantMedia.hidden = false;
      }
    }

    const separator = this.productUrl.split('?').length > 1 ? '&' : '?';
    const url = `${this.productUrl + separator}variant=${evt.target.dataset.variantId}`;

    // Update link hrefs to url of selected variant.
    this.links.forEach((link) => {
      link.href = url;
    });

    // Update the Quick Add button data.
    if (this.quickAddBtn) {
      this.quickAddBtn.dataset.selectedColor = evt.target.value;
    }
  }
}

customElements.define('product-card', ProductCard);

class QuantityInput extends HTMLElement {
  constructor() {
    super();
    this.input = this.querySelector('.qty-input__input');
    this.currentQty = this.input.value;
    this.changeEvent = new Event('change', { bubbles: true });

    this.addEventListener('click', this.handleClick.bind(this));
    this.input.addEventListener('focus', QuantityInput.handleFocus);
    this.input.addEventListener('keydown', this.handleKeydown.bind(this));
  }

  /**
   * Handles 'click' events on the quantity input element.
   * @param {object} evt - Event object.
   */
  handleClick(evt) {
    if (!evt.target.matches('.qty-input__btn')) return;
    evt.preventDefault();

    this.currentQty = this.input.value;

    if (evt.target.name === 'plus') {
      this.input.stepUp();
    } else {
      this.input.stepDown();
    }

    if (this.input.value !== this.currentQty) {
      this.input.dispatchEvent(this.changeEvent);
      this.currentQty = this.input.value;
    }
  }

  /**
   * Handles 'focus' events on the quantity input element.
   * @param {object} evt - Event object.
   */
  static handleFocus(evt) {
    if (window.matchMedia('(pointer: fine)').matches) {
      evt.target.select();
    }
  }

  /**
   * Handles 'keydown' events on the input field.
   * @param {object} evt - Event object.
   */
  handleKeydown(evt) {
    if (evt.key !== 'Enter') return;
    evt.preventDefault();

    if (this.input.value !== this.currentQty) {
      this.input.blur();
      this.input.focus();
      this.currentQty = this.input.value;
    }
  }
}

customElements.define('quantity-input', QuantityInput);

class SideDrawer extends HTMLElement {
  constructor() {
    super();
    this.overlay = document.querySelector('.js-overlay');
  }

  /**
   * Handles a 'click' event on the drawer.
   * @param {object} evt - Event object.
   */
  handleClick(evt) {
    if (evt.target.matches('.js-close-drawer') || evt.target === this.overlay) {
      this.close();
    }
  }

  /**
   * Opens the drawer.
   * @param {Element} [opener] - Element that triggered opening of the drawer.
   * @param {Element} [elementToFocus] - Element to focus after drawer opened.
   * @param {Function} [callback] - Callback function to trigger after the open has completed
   */
  open(opener, elementToFocus, callback) {
    this.dispatchEvent(new CustomEvent(`on:${this.dataset.name}:before-open`, {
      bubbles: true
    }));

    // Prevent page behind from scrolling when side drawer is open.
    this.scrollY = window.scrollY;
    document.body.classList.add('fixed');
    document.body.style.top = `-${this.scrollY}px`;
    document.documentElement.style.height = '100svh';

    this.overlay.classList.add('is-visible');
    this.setAttribute('open', '');
    this.setAttribute('aria-hidden', 'false');
    this.opener = opener;

    trapFocus(this, elementToFocus);

    // Create event handler variables (so the bound event listeners can be removed).
    this.clickHandler = this.clickHandler || this.handleClick.bind(this);
    this.keyupHandler = (evt) => {
      if (evt.key !== 'Escape' || evt.target.closest('.cart-drawer-popup')) return;
      this.close();
    };

    // Add event listeners (for while drawer is open).
    this.addEventListener('click', this.clickHandler);
    this.addEventListener('keyup', this.keyupHandler);
    this.overlay.addEventListener('click', this.clickHandler);

    // Handle events after the drawer opens
    const transitionDuration = parseFloat(getComputedStyle(this).getPropertyValue('--longest-transition-in-ms'));
    setTimeout(() => {
      if (callback) callback();
      this.dispatchEvent(new CustomEvent(`on:${this.dataset.name}:after-open`, {
        bubbles: true
      }));
    }, transitionDuration);
  }

  /**
   * Closes the drawer.
   * @param {Function} [callback] - Call back function to trigger after the close has completed
   */
  close(callback) {
    this.dispatchEvent(new CustomEvent(`on:${this.dataset.name}:before-close`, {
      bubbles: true
    }));

    this.removeAttribute('open');
    this.setAttribute('aria-hidden', 'true');
    this.overlay.classList.remove('is-visible');

    removeTrapFocus(this.opener);

    // Restore page position and scroll behaviour.
    document.documentElement.style.height = '';
    document.body.style.top = '';
    document.body.classList.remove('fixed');
    window.scrollTo(0, this.scrollY);

    // Remove event listeners added on drawer opening.
    this.removeEventListener('click', this.clickHandler);
    this.removeEventListener('keyup', this.keyupHandler);
    this.overlay.removeEventListener('click', this.clickHandler);

    // Handle events after the drawer closes
    const transitionDuration = parseFloat(getComputedStyle(this).getPropertyValue('--longest-transition-in-ms'));
    setTimeout(() => {
      if (callback) callback();
      this.dispatchEvent(new CustomEvent(`on:${this.dataset.name}:after-close`, {
        bubbles: true
      }));
    }, transitionDuration);
  }
}

customElements.define('side-drawer', SideDrawer);

window.addEventListener(
  'resize',
  debounce(() => {
    window.dispatchEvent(new CustomEvent('on:debounced-resize'));
  })
);

/**
 * Keeps a record of the height of the first occurrence of the given child element and stores it in
 * a css variable called `--[selector without the . or #]-height`. This height is kept up to date
 * when the browser changes size or the child element mutates.
 *
 * The selector must only match one element, and don't nest watched elements.
 *
 * Example usage:
 * <slide-show data-css-var-height=".quick-nav">
 * ... will result in:
 * <slide-show data-css-var-height=".quick-nav" style="--quick-nav-height: 483px;">
 */
function initCssVarHeightWatch() {
  const parentElems = document.querySelectorAll('[data-css-var-height]');
  if (parentElems) {
    const updateHeight = (elem) => {
      const parentElem = elem.closest('[data-css-var-height]');
      if (parentElem) {
        const selectors = parentElem.dataset.cssVarHeight.split(',');
        let matchedSelector = null;
        selectors.forEach((selector) => {
          if (elem.matches(selector.trim())) {
            matchedSelector = selector.trim();
          }
        });

        const variableName = `--${matchedSelector.replace(/^([#.])/, '')}-height`;
        parentElem.style.setProperty(variableName, `${elem.getBoundingClientRect().height.toFixed(2)}px`);
      }
    };

    let mutationObserver = null;
    if ('MutationObserver' in window) {
      mutationObserver = new MutationObserver(
        debounce((mutationList) => {
          const elemToWatch = mutationList[0].target.closest('[data-css-var-height]');
          if (elemToWatch) {
            updateHeight(elemToWatch.querySelector(elemToWatch.dataset.cssVarHeight));
          }
        })
      );
    }

    parentElems.forEach((parentElem) => {
      parentElem.dataset.cssVarHeight.split(',').forEach((selector) => {
        const elemToWatch = parentElem.querySelector(selector);
        if (elemToWatch) {
          if (mutationObserver) {
            mutationObserver.observe(elemToWatch, {
              childList: true,
              attributes: true,
              subtree: true
            });
          }

          window.addEventListener('on:debounced-resize', () => {
            const elem = parentElem.querySelector(selector);
            if (elem) updateHeight(elem);
          });

          document.addEventListener('on:css-var-height:update', () => {
            const elem = parentElem.querySelector(selector);
            if (elem) updateHeight(elem);
          });

          updateHeight(elemToWatch);
        }
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', initCssVarHeightWatch);
document.addEventListener('shopify:section:load', initCssVarHeightWatch);

/**
 * Provides convenient utility functions for interacting with elements
 */
(() => {
  theme.elementUtil = {};

  /**
   * Allows for removal of elements in one line of code
   * @param {object} elem - Element to remove
   */
  theme.elementUtil.remove = (elem) => {
    if (elem) {
      if (typeof elem.remove === 'function') {
        elem.remove();
      } else {
        elem.forEach((thisElem) => {
          thisElem.remove();
        });
      }
    }
  };

  /**
   * Checks if the passed element is in viewport or not
   * @param {object} elem - Element to check the view of
   * @returns {boolean}
   */
  theme.elementUtil.isInViewport = (elem) => {
    const rect = elem.getBoundingClientRect();
    return (
      Math.round(rect.top) >= 0
      && Math.round(rect.left) >= 0
      && Math.round(rect.bottom) <= (window.innerHeight || document.documentElement.clientHeight)
      && Math.round(rect.right) <= (window.innerWidth || document.documentElement.clientWidth)
    );
  };
})();

/**
 * Utility functions for interacting with LocalStorage/SessionStorage
 */
(() => {
  theme.storageUtil = {};

  theme.storageUtil.set = (key, value, isSession) => {
    if (isSession) {
      sessionStorage.setItem(
        `cc-${key}`,
        typeof value === 'object' ? JSON.stringify(value) : value
      );
    } else {
      localStorage.setItem(`cc-${key}`, typeof value === 'object' ? JSON.stringify(value) : value);
    }
  };

  theme.storageUtil.get = (key, isJson, isSession) => {
    let value = isSession ? sessionStorage.getItem(`cc-${key}`) : localStorage.getItem(`cc-${key}`);
    if (isJson) {
      value = JSON.parse(value);
    }
    return value;
  };

  theme.storageUtil.remove = (key, isSession) => {
    if (isSession) {
      sessionStorage.removeItem(`cc-${key}`);
    } else {
      localStorage.removeItem(`cc-${key}`);
    }
  };
})();

class StoreHeader extends HTMLElement {
  constructor() {
    super();
    this.menu = this.querySelector('.main-menu__content');
    this.searchToggle = this.querySelector('.js-show-search');
    this.searchToggleLeft = this.querySelector('.js-show-search-left');
    this.mobNavToggle = this.querySelector('.main-menu__toggle');
    this.shakeyCartIcon = this.querySelector('.header__icon--cart-shake');
    this.headerGroupSections = document.querySelectorAll('.shopify-section-group-header-group');

    this.stickyInitialised = false;
    this.stickyTransitioning = false;
    this.lastScrollPos = 0;

    this.headerTransitionSpeed = parseFloat(
      getComputedStyle(this).getPropertyValue('--header-transition-speed')
    );

    window.setHeaderHeight();
    this.bindEvents();
    this.init();

    document.addEventListener('DOMContentLoaded', this.setMenuHeight.bind(this));
  }

  disconnectedCallback() {
    window.removeEventListener('on:debounced-resize', this.resizeHandler);
    if (this.breakpointChangeHandler) {
      window.removeEventListener('on:breakpoint-change', this.breakpointChangeHandler);
    }
  }

  bindEvents() {
    this.resizeHandler = this.resizeHandler || this.updateHeaderHeights.bind(this);
    window.addEventListener('on:debounced-resize', this.resizeHandler);

    this.mobNavToggle.addEventListener('click', window.setHeaderHeight);
    this.mobNavToggle.addEventListener('click', this.setHeaderEnd.bind(this));

    if (this.dataset.isSticky) {
      this.breakpointChangeHandler = this.breakpointChangeHandler || this.init.bind(this);
      window.addEventListener('on:breakpoint-change', this.breakpointChangeHandler);
    }

    if (this.dataset.isSearchMinimised) {
      if (this.searchToggle) {
        this.searchToggle.addEventListener('click', this.handleSearchToggleClick.bind(this));
      }

      if (this.searchToggleLeft) {
        this.searchToggleLeft.addEventListener('click', this.handleSearchToggleClick.bind(this));
      }
    }
  }

  /**
   * Init sticky behaviour of the header
   */
  init() {
    this.updateHeaderHeights();

    if (this.dataset.isSticky) {
      if (theme.mediaMatches.md && !this.stickyInitialised) {
        this.stickyInitialised = true;
        // Animate the menu in/out on scroll up/down
        window.addEventListener('scroll', this.handleScroll.bind(this));
      }

      setTimeout(() => {
        document.querySelector('.cc-header').classList.add('cc-header--sticky');
      });

      this.setMenuHeight();
      this.setHeaderEnd();
    }

    // Stop the cart icon from shaking when necessary
    if (this.shakeyCartIcon) {
      let pageCount = theme.storageUtil.get('shake-page-count', false, true);
      pageCount = pageCount ? parseInt(pageCount, 10) + 1 : 1;
      const shakeFrequency = parseInt(this.shakeyCartIcon.dataset.shakeFrequency, 10);
      if (pageCount < shakeFrequency) {
        this.shakeyCartIcon.classList.remove('header__icon--cart-shake');
      } else {
        pageCount = 0;
      }
      theme.storageUtil.set('shake-page-count', pageCount, true);
    }
  }

  /**
   * Toggles visibility of the search bar
   * @param {object} evt - Event object
   */
  handleSearchToggleClick(evt) {
    evt.preventDefault();
    const searchBar = this.querySelector('.js-search-bar');
    if (this.classList.contains('search-is-collapsed')) {
      this.classList.remove('search-is-collapsed');

      // Wait for reveal animation to complete
      setTimeout(() => {
        this.classList.add('search-is-visible');
        const searchInput = searchBar.querySelector('.js-search-input');
        searchInput.focus();
        window.setHeaderHeight();
      }, this.headerTransitionSpeed);
    } else {
      this.classList.remove('search-is-visible');

      setTimeout(() => {
        this.classList.add('search-is-collapsed');
      });

      setTimeout(window.setHeaderHeight, this.headerTransitionSpeed);
    }
  }

  /**
   * Wrapper for calling the two below
   */
  updateHeaderHeights() {
    if (theme.mediaMatches.md) {
      this.setMenuHeight();
      setTimeout(window.setHeaderHeight, this.headerTransitionSpeed);
    } else {
      window.setHeaderHeight();
    }

    // Set a css variable to record where the page content starts
    if (this.headerGroupSections && this.headerGroupSections.length > 0) {
      let headerGroupHeight = 0;
      this.headerGroupSections.forEach((section) => {
        headerGroupHeight += section.getBoundingClientRect().height;
      });

      if (headerGroupHeight > 0) {
        document.documentElement.style.setProperty(
          '--content-start',
          `${headerGroupHeight.toFixed(1)}px`
        );
      }
    }
  }

  /**
   * Set a css variable to the height of the menu links
   */
  setMenuHeight() {
    if (this.menu && this.menu.clientHeight) {
      this.style.setProperty('--menu-height', `${this.menu.clientHeight + 16}px`);
      document.documentElement.style.setProperty('--header-height', `${this.clientHeight}px`);
    }
  }

  /**
   * Handles 'scroll' event on the header
   */
  handleScroll() {
    if (!document.body.classList.contains('fixed') && !this.stickyTransitioning) {
      if (document.documentElement.scrollTop < 200) {
        this.show();
      } else if (this.lastScrollPos < document.documentElement.scrollTop) {
        this.hide();
      } else if (this.lastScrollPos - 5 > document.documentElement.scrollTop) {
        this.show();
      }

      this.lastScrollPos = document.documentElement.scrollTop;
    }
  }

  /**
   * Set a css variable to indicate where the nav ends on the page
   */
  setHeaderEnd() {
    const headerEnd = Number(this.getBoundingClientRect().top + this.clientHeight);
    document.documentElement.style.setProperty('--header-end', `${headerEnd.toFixed(1)}px`);
    document.documentElement.style.setProperty(
      '--header-end-padded',
      `${(headerEnd + (theme.mediaMatches.md ? 56 : 20)).toFixed(1)}px`
    );
  }

  /**
   * Updates hidden class for header element
   */
  show() {
    this.classList.remove('is-out');
    this.stickyTransitioning = true;
    setTimeout(() => {
      this.lastScrollPos = document.documentElement.scrollTop;
      this.stickyTransitioning = false;
      this.handleScroll();
      this.setHeaderEnd();
    }, 300);
  }

  /**
   * Updates hidden class for header element
   */
  hide() {
    if (!this.stickyTransitioning) {
      this.classList.add('is-out');
      this.stickyTransitioning = true;
      setTimeout(() => {
        this.lastScrollPos = document.documentElement.scrollTop;
        this.stickyTransitioning = false;
        this.handleScroll();
        this.setHeaderEnd();
      }, 300);
    }
  }
}

customElements.define('store-header', StoreHeader);

class MainMenu extends HTMLElement {
  constructor() {
    super();
    this.mainDisclosure = this.querySelector('.main-menu__disclosure');
    this.mainToggle = this.querySelector('.main-menu__toggle');
    this.firstLevelMenuLinks = this.querySelectorAll('.js-nav-hover');
    this.firstLevelSingleLinks = this.querySelectorAll('.main-nav__item--primary:not(.main-nav__item-content)');
    this.nav = this.querySelector('.main-nav');
    this.overlay = document.querySelector('.js-overlay');
    this.searchIcon = document.querySelector('.header__icons .js-show-search');
    this.sidebarLinks = this.querySelectorAll('.js-sidebar-hover');
    this.elementsWhichCloseMenus = document.querySelectorAll('.js-closes-menu');

    this.isTouchEvent = false;
    this.childNavOpen = false;
    this.overlayOpen = false;

    this.addListeners();
    this.init();
  }

  disconnectedCallback() {
    window.removeEventListener('focusin', this.focusOutHandler);
    window.removeEventListener('on:breakpoint-change', this.breakpointChangeHandler);

    if (Shopify.designMode) {
      document.removeEventListener('shopify:block:select', this.blockSelectHandler);
      document.removeEventListener('shopify:block:deselect', this.blockDeselectHandler);
    }
  }

  addListeners() {
    this.focusOutHandler = this.focusOutHandler || this.handleFocusOut.bind(this);
    this.breakpointChangeHandler = this.breakpointChangeHandler || this.init.bind(this);

    this.mainDisclosure.addEventListener('transitionend', MainMenu.handleTransition.bind(this));
    this.mainToggle.addEventListener('click', this.handleMainMenuToggle.bind(this));
    this.nav.addEventListener('touchstart', () => { this.isTouchEvent = true; });
    this.nav.addEventListener('click', MainMenu.handleNavClick.bind(this));
    this.nav.addEventListener('touchend', () => setTimeout(() => { this.isTouchEvent = false; }, 100));
    window.addEventListener('focusin', this.focusOutHandler);
    window.addEventListener('on:breakpoint-change', this.breakpointChangeHandler);

    if (Shopify.designMode) {
      this.blockSelectHandler = this.blockSelectHandler || this.handleBlockSelect.bind(this);
      this.blockDeselectHandler = this.blockDeselectHandler || this.handleBlockDeselect.bind(this);
      document.addEventListener('shopify:block:select', this.blockSelectHandler);
      document.addEventListener('shopify:block:deselect', this.blockDeselectHandler);
    }

    if (!theme.mediaMatches.md && this.searchIcon) {
      this.searchIcon.addEventListener('click', this.closeMainDisclosure.bind(this));
    }
  }

  /**
   * Sets 'open' state of the main disclosure element.
   * @param {?object} evt - Event object.
   */
  init(evt) {
    if (!evt) {
      this.mainDisclosure.open = theme.mediaMatches.md;
    } else if (!theme.mediaMatches.md && !this.childNavOpen) {
      this.close(this.mainDisclosure);

      if (this.overlayOpen) this.toggleOverlay(false);
    } else {
      // If there's another menu open, close it.
      const activeDisclosure = this.nav.querySelector('details.is-open');
      if (activeDisclosure) {
        this.close(activeDisclosure);
      } else {
        MainMenu.open(this.mainDisclosure, false);
      }

      if (!this.childNavOpen) {
        if (this.overlayOpen) this.toggleOverlay(false);
      }
    }

    // Close the submenus (they're open for no-js)
    this.querySelectorAll('.child-nav--dropdown details[open]').forEach((childToggle) => {
      childToggle.removeAttribute('open');
    });

    if (theme.device.hasHover) {
      // Add event handler (so the bound event listener can be removed)
      this.mouseEnterMenuLinkHandler = this.mouseEnterMenuLinkHandler
        || this.handleMouseEnterMenuLink.bind(this);
      this.mouseLeaveMenuLinkHandler = this.mouseLeaveMenuLinkHandler
        || this.handleMouseLeaveMenuLink.bind(this);
      this.mouseEnterSingleLinkHandler = this.mouseEnterSingleLinkHandler
        || this.handleMouseEnterSingleLink.bind(this);
      this.mouseLeaveSingleLinkHandler = this.mouseLeaveSingleLinkHandler
        || this.handleMouseLeaveSingleLink.bind(this);
      this.mouseEnterMenuCloserHandler = this.mouseEnterMenuCloserHandler
        || this.handleClose.bind(this);

      // Bind listening events for mouse enter/leave a main menu link
      if (!this.mouseOverListening && theme.mediaMatches.md) {
        this.firstLevelMenuLinks.forEach((menuLink) => {
          menuLink.addEventListener('mouseenter', this.mouseEnterMenuLinkHandler);
          menuLink.addEventListener('mouseleave', this.mouseLeaveMenuLinkHandler);
        });
        this.firstLevelSingleLinks.forEach((singleLink) => {
          singleLink.addEventListener('mouseenter', this.mouseEnterSingleLinkHandler);
          singleLink.addEventListener('mouseleave', this.mouseLeaveSingleLinkHandler);
        });
        this.elementsWhichCloseMenus.forEach((elem) => {
          elem.addEventListener('mouseenter', this.mouseEnterMenuCloserHandler);
        });
        this.mouseOverListening = true;
      } else if (this.mouseOverListening && !theme.mediaMatches.md) {
        this.firstLevelMenuLinks.forEach((menuLink) => {
          menuLink.removeEventListener('mouseenter', this.mouseEnterMenuLinkHandler);
          menuLink.removeEventListener('mouseleave', this.mouseLeaveMenuLinkHandler);
        });
        this.firstLevelSingleLinks.forEach((singleLink) => {
          singleLink.removeEventListener('mouseenter', this.mouseEnterSingleLinkHandler);
          singleLink.removeEventListener('mouseleave', this.mouseLeaveSingleLinkHandler);
        });
        this.elementsWhichCloseMenus.forEach((elem) => {
          elem.removeEventListener('mouseenter', this.mouseEnterMenuCloserHandler);
        });
        this.mouseOverListening = false;
      }

      if (this.sidebarLinks) {
        if (!this.mouseOverSidebarListening && theme.mediaMatches.md) {
          this.sidebarLinks.forEach((sidebarLink) => {
            sidebarLink.addEventListener('mouseenter', MainMenu.handleSidenavMenuToggle);
          });
          this.mouseOverSidebarListening = true;
        } else if (this.mouseOverSidebarListening && !theme.mediaMatches.md) {
          this.sidebarLinks.forEach((sidebarLink) => {
            sidebarLink.removeEventListener('mouseenter', MainMenu.handleSidenavMenuToggle);
          });
          this.mouseOverSidebarListening = false;
        }
      }
    }
  }

  /**
   * Close the menu if the nav loses focus
   * @param {object} evt - Event object.
   */
  handleFocusOut(evt) {
    if (!this.contains(evt.target) && this.overlayOpen) this.handleClose();
  }

  /**
   * Updates the visible sidebar item
   * @param {object} evt - Event object.
   * @param {Element} [summaryElem] - The summary element to open.
   */
  static handleSidenavMenuToggle(evt, summaryElem = evt.target) {
    const container = summaryElem.closest('.child-nav');
    const lastSidenavElem = container.querySelector('.is-visible');
    if (lastSidenavElem) {
      lastSidenavElem.classList.remove('is-visible');
    }
    summaryElem.classList.add('is-visible');

    // Maintain a CSS variable which records the height of the current sidebar links
    const menu = summaryElem.closest('nav-menu');
    if (menu) {
      const openDisclosure = menu.querySelector('.disclosure__panel');
      if (openDisclosure) {
        container.style.setProperty(
          '--sidebar-height',
          `${Number.parseInt(openDisclosure.getBoundingClientRect().height, 10)}px`
        );
      }
    }
  }

  /**
   * Handles 'toggle' event on the main disclosure element.
   * @param {object} evt - Event object.
   */
  handleMainMenuToggle(evt) {
    evt.preventDefault();
    this.opener = this.mainToggle;

    if (!this.mainDisclosure.open) {
      MainMenu.open(this.mainDisclosure);
    } else {
      this.close(this.mainDisclosure, true);
    }
  }

  /**
   * Handles 'mouseenter' event on the main menu items using a timeout to infer hover intent
   * @param {object} evt - Event object
   */
  handleMouseEnterMenuLink(evt) {
    this.menuLinkTimeout = setTimeout(
      this.openMenuFromMouseEnter.bind(this, evt.target),
      Number.parseInt(this.dataset.menuSensitivity, 10)
    );
  }

  /**
   * Handles 'mouseleave' event on the main menu items - clears the timeout
   */
  handleMouseLeaveMenuLink() {
    if (this.menuLinkTimeout) clearTimeout(this.menuLinkTimeout);
  }

  /**
   * Handles 'mouseenter' event on links with no submenu items using a timeout to infer hover intent
   */
  handleMouseEnterSingleLink() {
    this.singleLinkTimeout = setTimeout(() => {
      this.handleClose();
    }, Number.parseInt(this.dataset.menuSensitivity, 10));
  }

  /**
   * Handles 'mouseleave' event on links with no submenu - clears the timeout
   */
  handleMouseLeaveSingleLink() {
    if (this.singleLinkTimeout) clearTimeout(this.singleLinkTimeout);
  }

  /**
   * Opens the menu being hovered over
   * @param {Element} menuElem - The menu element to open.
   */
  openMenuFromMouseEnter(menuElem) {
    trapFocus(menuElem);

    const disclosure = menuElem.closest('details');
    if (!disclosure.classList.contains('is-open')) {
      const activeDisclosure = this.nav.querySelector('details.is-open');

      // If there's another menu open, close it.
      if (activeDisclosure && activeDisclosure !== disclosure) {
        this.close(activeDisclosure);
      } else {
        this.toggleOverlay(!this.overlayOpen);
      }

      MainMenu.open(disclosure);
    }
  }

  /**
   * Handles 'click' event on the nav.
   * @param {object} evt - Event object.
   */
  static handleNavClick(evt) {
    const mainMenuContent = evt.target.closest('.main-menu__content');
    let el = evt.target;

    // Handle sidebar link clicks
    if (theme.mediaMatches.md && el.matches('.js-sidebar-hover') && el.closest('summary')) {
      evt.preventDefault();
      MainMenu.handleSidenavMenuToggle(evt);
    }

    // Don't follow # links
    if (evt.target.href && evt.target.href.endsWith('#')) evt.preventDefault();

    // If we're on a device without hover on a larger screen, open the menu
    if (theme.mediaMatches.md && !theme.device.hasHover) {
      el = evt.target.closest('.js-toggle');
      if (!el) return;
    }

    const isLargeTouchDevice = this.isTouchEvent && theme.device.hasHover && theme.mediaMatches.md;

    if (!el.matches('.js-toggle,.js-back') && !isLargeTouchDevice) return;

    if (el.closest('summary.child-nav__item--toggle') && isLargeTouchDevice) return;

    const disclosure = el.closest('details');

    if (theme.mediaMatches.md && theme.device.hasHover && !isLargeTouchDevice) {
      disclosure.classList.toggle('is-open');
      return;
    }

    this.opener = el;

    if (el.matches('.js-toggle') || (isLargeTouchDevice && el.closest('summary'))) {
      evt.preventDefault();

      if (!theme.mediaMatches.md) {
        mainMenuContent.classList.add('main-menu__content--no-focus');
      }

      if (!disclosure.classList.contains('is-open')) {
        this.childNavOpen = true;

        const activeDisclosure = this.nav.querySelector('details.is-open');
        // If there's another menu open, close it.
        if (activeDisclosure && activeDisclosure !== disclosure) {
          this.close(activeDisclosure);
        } else if (theme.mediaMatches.md) {
          this.toggleOverlay(!this.overlayOpen);
        }

        MainMenu.open(disclosure);
      } else {
        this.close(disclosure, true);
        this.childNavOpen = false;
        this.toggleOverlay(false);
      }
    } else if (el.matches('.js-back')) {
      evt.preventDefault();
      this.close(disclosure, true);
      this.childNavOpen = false;

      if (!theme.mediaMatches.md) {
        mainMenuContent.classList.remove('main-menu__content--no-focus');
      }
    }
  }

  /**
   * Handles 'transitionend' event on the nav.
   * @param {object} evt - Event object.
   */
  static handleTransition(evt) {
    const disclosure = evt.target.closest('details');

    if (disclosure.classList.contains('is-closing')) {
      disclosure.classList.remove('is-closing');
      disclosure.open = false;

      removeTrapFocus();
      this.opener = null;
    }
  }

  /**
   * Handles a 'click' event on the overlay and a 'keyup' event on the nav.
   * @param {object} evt - Event object.
   */
  handleClose(evt) {
    if (evt && evt.type === 'keyup' && evt.key !== 'Escape') return;

    const disclosure = theme.mediaMatches.md
      ? this.nav.querySelector('details.is-open')
      : this.mainDisclosure;

    if (disclosure) {
      this.close(disclosure, true);
      this.toggleOverlay(false);
      this.childNavOpen = false;
    }
  }

  /**
   * Toggles visibility of the background overlay.
   * @param {boolean} show - Show the overlay.
   */
  toggleOverlay(show) {
    this.overlayOpen = show;
    this.overlay.classList.toggle('overlay--nav', show);
    this.overlay.classList.toggle('is-visible', show);

    if (show) {
      // Add event handler (so the bound event listener can be removed).
      this.closeHandler = this.closeHandler || this.handleClose.bind(this);

      // Add event listeners (for while the nav is open).
      this.overlay.addEventListener('click', this.closeHandler);
      this.nav.addEventListener('keyup', this.closeHandler);

      if (theme.mediaMatches.md) {
        this.overlay.addEventListener('mouseenter', this.closeHandler);
      }
    } else {
      // Remove event listener added on nav opening.
      this.overlay.removeEventListener('click', this.closeHandler);
      this.nav.removeEventListener('keyup', this.closeHandler);

      if (theme.mediaMatches.md) {
        this.overlay.removeEventListener('mouseenter', this.closeHandler);
      }
    }
  }

  /**
   * Closes the main nav menu
   */
  closeMainDisclosure() {
    if (this.mainDisclosure.classList.contains('is-open')) {
      this.close(this.mainDisclosure, true);
      this.toggleOverlay(false);
      this.childNavOpen = false;
    }
  }

  /**
   * Updates open/opening classes for disclosure element.
   * @param {Element} el - Disclosure element.
   * @param {boolean} [mainMenuOpen=true] - Main menu is open.
   */
  static open(el, mainMenuOpen = true) {
    el.open = true;

    // Cap the max width of grandchildren on desktop their contents don't widen the dropdown
    if (theme.mediaMatches.md && !el.classList.contains('js-mega-nav')) {
      // If the nav menu spills off the right of the screen, shift it to the left
      const dropdownContainer = el.querySelector('.main-nav__child');
      if (dropdownContainer?.getBoundingClientRect().right > window.innerWidth) {
        dropdownContainer.classList.add('main-nav__child--offset-right');
      }

      const dropdown = el.querySelector('.child-nav--dropdown');
      if (dropdown) {
        dropdown.querySelectorAll('.main-nav__grandchild').forEach((grandchildElem) => {
          grandchildElem.style.maxWidth = `${dropdown.clientWidth}px`;
        });
      }
    } else if (theme.mediaMatches.md && el.querySelector('.mega-nav--sidebar')) {
      const firstSummaryElem = el.querySelector('.mega-nav--sidebar details[open] summary');
      if (firstSummaryElem) {
        // Open the first sidebar mega menu
        MainMenu.handleSidenavMenuToggle(null, firstSummaryElem);
      }
    }

    // Slight delay required before starting transitions.
    setTimeout(() => {
      el.classList.remove('is-closing');
      el.classList.add('is-open');
    });

    if (mainMenuOpen) {
      removeTrapFocus();
      trapFocus(el);

      if (theme.mediaMatches.md || el.classList.contains('main-menu__disclosure')) {
        document.body.classList.add('overflow-hidden');

        if (!theme.mediaMatches.md && !document.querySelector('store-header[data-is-sticky="true"]')) {
          document.body.classList.add('fixed');
        }
      }
    }
  }

  /**
   * Updates close/closing classes of a disclosure element.
   * @param {Element} el - Disclosure element.
   * @param {boolean} [transition=false] - Close action has a CSS transition.
   */
  close(el, transition = true) {
    el.classList.remove('is-open');

    if (transition) {
      el.classList.add('is-closing');
    } else {
      el.classList.remove('is-closing');
      el.open = false;

      removeTrapFocus(this.opener);
      this.opener = null;
    }

    setTimeout(() => {
      const offsetMenu = el.querySelector('.main-nav__child--offset-right');
      if (offsetMenu) offsetMenu.classList.remove('main-nav__child--offset-right');
    }, 200);

    if (theme.mediaMatches.md || el.classList.contains('main-menu__disclosure')) {
      document.body.classList.remove('overflow-hidden', 'fixed');
    }
  }

  /**
   * Decide whether to show a particular mega menu
   * @param {object} evt - Event object
   */
  handleBlockSelect(evt) {
    const activeDisclosure = this.nav.querySelector('details.is-open');
    if (activeDisclosure) {
      this.close(activeDisclosure, false);
    }

    if (evt.target.matches('.js-mega-nav')) {
      MainMenu.open(evt.target, false);
      this.toggleOverlay(true);
    }
  }

  /**
   * Decide whether to hide a particular mega menu
   * @param {object} evt - Event object
   */
  handleBlockDeselect(evt) {
    if (evt.target.matches('.js-mega-nav')) {
      this.close(evt.target, false);
      this.toggleOverlay(false);
    }
  }
}

customElements.define('main-menu', MainMenu);

class CarouselSlider extends HTMLElement {
  constructor() {
    super();
    window.initLazyScript(this, this.init.bind(this));
  }

  disconnectedCallback() {
    window.removeEventListener('on:debounced-resize', this.breakpointChangeHandler);
  }

  init() {
    // Ignore nested slides
    this.slides = Array.from(this.querySelector('.slider__item').parentElement.children).filter((child) => !child.hasAttribute('hidden'));
    if (this.slides.length < 2) return;
    this.slider = this.querySelector('.slider');
    this.grid = this.querySelector('.slider__grid');
    this.nav = this.querySelector(`.slider-nav__btn[aria-controls='${this.slider.id}']`)?.closest('.slider-nav');
    this.rtl = document.dir === 'rtl';
    this.breakpointChangeHandler = this.breakpointChangeHandler
      || this.handleBreakpointChange.bind(this);

    if (this.nav) {
      this.prevBtn = this.nav.querySelector('button[name="prev"]');
      this.nextBtn = this.nav.querySelector('button[name="next"]');
    }

    this.initSlider();
    window.addEventListener('on:debounced-resize', this.breakpointChangeHandler);
  }

  initSlider() {
    if (!(this.getAttribute('disable-mobile') && !window.matchMedia(theme.mediaQueries.sm).matches)
      && !(this.getAttribute('disable-desktop') && window.matchMedia(theme.mediaQueries.sm).matches)) {
      this.gridWidth = this.grid.clientWidth;

      // Distance between leading edges of adjacent slides (i.e. width of card + gap).
      this.slideSpan = this.getWindowOffset(this.slides[1]) - this.getWindowOffset(this.slides[0]);

      // Width of gap between slides.
      this.slideGap = this.slideSpan - this.slides[0].clientWidth;

      this.slidesPerPage = Math.round((this.gridWidth + this.slideGap) / this.slideSpan);
      this.slidesToScroll = theme.settings.sliderItemsPerNav === 'page' ? this.slidesPerPage : 1;
      this.totalPages = this.slides.length - this.slidesPerPage + 1;

      this.setCarouselState(this.totalPages > 1);
      if (this.totalPages < 2) return;

      this.sliderStart = this.getWindowOffset(this.slider);
      if (!this.sliderStart) this.sliderStart = (this.slider.clientWidth - this.gridWidth) / 2;
      this.sliderEnd = this.sliderStart + this.gridWidth;

      if (window.matchMedia('(pointer: fine)').matches) {
        this.slider.classList.add('is-grabbable');
      }

      this.addListeners();
      this.setButtonStates();
    } else {
      this.setAttribute('inactive', '');
    }

    // Init the custom scrollbars
    if (!this.slider.classList.contains('slider--no-scrollbar') && window.OverlayScrollbarsGlobal) {
      window.OverlayScrollbarsGlobal.OverlayScrollbars({
        target: this.slider.parentElement,
        elements: {
          viewport: this.slider
        }
      }, {});
    }
  }

  addListeners() {
    if (this.nav) {
      this.scrollHandler = debounce(this.handleScroll.bind(this));
      this.navClickHandler = this.handleNavClick.bind(this);

      this.slider.addEventListener('scroll', this.scrollHandler);
      this.nav.addEventListener('click', this.navClickHandler);
    }

    if (window.matchMedia('(pointer: fine)').matches) {
      this.mousedownHandler = this.handleMousedown.bind(this);
      this.mouseupHandler = this.handleMouseup.bind(this);
      this.mousemoveHandler = this.handleMousemove.bind(this);

      this.slider.addEventListener('mousedown', this.mousedownHandler);
      this.slider.addEventListener('mouseup', this.mouseupHandler);
      this.slider.addEventListener('mouseleave', this.mouseupHandler);
      this.slider.addEventListener('mousemove', this.mousemoveHandler);
    }
  }

  removeListeners() {
    if (this.nav) {
      this.slider.removeEventListener('scroll', this.scrollHandler);
      this.nav.removeEventListener('click', this.navClickHandler);
    }

    this.slider.removeEventListener('mousedown', this.mousedownHandler);
    this.slider.removeEventListener('mouseup', this.mouseupHandler);
    this.slider.removeEventListener('mouseleave', this.mouseupHandler);
    this.slider.removeEventListener('mousemove', this.mousemoveHandler);
  }

  /**
   * Handles 'scroll' events on the slider element.
   */
  handleScroll() {
    this.currentIndex = Math.round(this.slider.scrollLeft / this.slideSpan);
    this.setButtonStates();
  }

  /**
   * Handles 'mousedown' events on the slider element.
   * @param {object} evt - Event object.
   */
  handleMousedown(evt) {
    this.mousedown = true;
    this.startX = evt.pageX - this.sliderStart;
    this.scrollPos = this.slider.scrollLeft;
    this.slider.classList.add('is-grabbing');
  }

  /**
   * Handles 'mouseup' events on the slider element.
   */
  handleMouseup() {
    this.mousedown = false;
    this.slider.classList.remove('is-grabbing');
  }

  /**
   * Handles 'mousemove' events on the slider element.
   * @param {object} evt - Event object.
   */
  handleMousemove(evt) {
    if (!this.mousedown) return;
    evt.preventDefault();

    const x = evt.pageX - this.sliderStart;
    this.slider.scrollLeft = this.scrollPos - (x - this.startX) * 2;
  }

  /**
   * Handles 'click' events on the nav buttons container.
   * @param {object} evt - Event object.
   */
  handleNavClick(evt) {
    if (!evt.target.matches('.slider-nav__btn')) return;

    if ((evt.target.name === 'next' && !this.rtl) || (evt.target.name === 'prev' && this.rtl)) {
      this.scrollPos = this.slider.scrollLeft + this.slidesToScroll * this.slideSpan;
    } else {
      this.scrollPos = this.slider.scrollLeft - this.slidesToScroll * this.slideSpan;
    }

    this.slider.scrollTo({ left: this.scrollPos, behavior: 'smooth' });
  }

  /**
   * Handles 'on:debounced-resize' events on the window.
   */
  handleBreakpointChange() {
    this.removeListeners();
    this.initSlider();
  }

  /**
   * Gets the offset of an element from the edge of the viewport (left for ltr, right for rtl).
   * @param {number} el - Element.
   * @returns {number}
   */
  getWindowOffset(el) {
    return this.rtl
      ? window.innerWidth - el.getBoundingClientRect().right
      : el.getBoundingClientRect().left;
  }

  /**
   * Gets the visible state of a slide.
   * @param {Element} el - Slide element.
   * @returns {boolean}
   */
  getSlideVisibility(el) {
    const slideStart = this.getWindowOffset(el);
    const slideEnd = Math.floor(slideStart + this.slides[0].clientWidth);
    return slideStart >= this.sliderStart && slideEnd <= this.sliderEnd;
  }

  /**
   * Sets the active state of the carousel.
   * @param {boolean} active - Set carousel as active.
   */
  setCarouselState(active) {
    if (active) {
      this.removeAttribute('inactive');

      // If slider width changed when activated, reinitialise it.
      if (this.gridWidth !== this.grid.clientWidth) {
        this.handleBreakpointChange();
      }
    } else {
      this.setAttribute('inactive', '');
    }
  }

  /**
   * Sets the disabled state of the nav buttons.
   */
  setButtonStates() {
    if (!this.prevBtn && !this.nextBtn) {
      return;
    }

    this.prevBtn.disabled = this.getSlideVisibility(this.slides[0]) && this.slider.scrollLeft === 0;
    this.nextBtn.disabled = this.getSlideVisibility(this.slides[this.slides.length - 1]);
  }
}

customElements.define('carousel-slider', CarouselSlider);

/*!
 * OverlayScrollbars
 * Version: 2.5.0
 *
 * Copyright (c) Rene Haas | KingSora.
 * https://github.com/KingSora
 *
 * Released under the MIT license.
 */
// eslint-disable-next-line
window.OverlayScrollbarsGlobal=function(t){const e=(t,e)=>{const{o:n,u:r,_:o}=t;let s,c=n;const l=(t,e)=>{const n=c,l=t,i=e||(r?!r(n,l):n!==l);return (i||o)&&(c=l,s=n),[c,i,s]};return [e?t=>l(e(c,s),t):l,t=>[c,!!t,s]]},n="undefined"!=typeof window,r=n?window:{},o=Math.max,s=Math.min,c=Math.round,l=Math.abs,i=r.cancelAnimationFrame,a=r.requestAnimationFrame,u=r.setTimeout,d=r.clearTimeout,p=t=>void 0!==r[t]?r[t]:void 0,f=p("MutationObserver"),h=p("IntersectionObserver"),y=p("ResizeObserver"),v=p("ScrollTimeline"),b=n&&Node.ELEMENT_NODE,{toString:w,hasOwnProperty:g}=Object.prototype,m=/^\[object (.+)\]$/,x=t=>void 0===t,$=t=>null===t,S=t=>"number"==typeof t,O=t=>"string"==typeof t,T=t=>"boolean"==typeof t,L=t=>"function"==typeof t,P=t=>Array.isArray(t),E=t=>"object"==typeof t&&!P(t)&&!$(t),C=t=>{const e=!!t&&t.length,n=S(e)&&e>-1&&e%1==0;return !(!(P(t)||!L(t)&&n)||e>0&&E(t)&&!(e-1 in t))},D=t=>{if(!t||!E(t)||"object"!==(t=>x(t)||$(t)?`${t}`:w.call(t).replace(m,"$1").toLowerCase())(t))return !1;let e;const n="constructor",r=t[n],o=r&&r.prototype,s=g.call(t,n),c=o&&g.call(o,"isPrototypeOf");if(r&&!s&&!c)return !1;for(e in t);return x(e)||g.call(t,e)},k=t=>{const e=HTMLElement;return !!t&&(e?t instanceof e:t.nodeType===b)},M=t=>{const e=Element;return !!t&&(e?t instanceof e:t.nodeType===b)},H=()=>performance.now(),A=(t,e,n,r,s)=>{let c=0;const l=H(),u=o(0,n),d=n=>{const i=H(),p=i-l>=u,f=n?1:1-(o(0,l+u-i)/u||0),h=(e-t)*(L(s)?s(f,f*u,0,1,u):f)+t,y=p||1===f;r&&r(h,f,y),c=y?0:a((()=>d()));};return d(),t=>{i(c),t&&d(t);}};function N(t,e){if(C(t))for(let n=0;n<t.length&&!1!==e(t[n],n,t);n++);else t&&N(Object.keys(t),(n=>e(t[n],n,t)));return t}const R=(t,e)=>t.indexOf(e)>=0,V=(t,e)=>t.concat(e),I=(t,e,n)=>(n||O(e)||!C(e)?t.push(e):Array.prototype.push.apply(t,e),t),z=t=>Array.from(t||[]),j=t=>P(t)?t:[t],_=t=>!!t&&!t.length,U=t=>z(new Set(t)),B=(t,e,n)=>{N(t,(t=>t&&t.apply(void 0,e||[]))),!n&&(t.length=0);},F="paddingTop",Z="paddingRight",X="paddingLeft",W="paddingBottom",Y="marginLeft",q="marginRight",G="marginBottom",J="overflowX",K="overflowY",Q="width",tt="height",et="hidden",nt="visible",rt=(t,e,n,r)=>{if(t&&e){let o=!0;return N(n,(n=>{(r?r(t[n]):t[n])!==(r?r(e[n]):e[n])&&(o=!1);})),o}return !1},ot=(t,e)=>rt(t,e,["w","h"]),st=(t,e)=>rt(t,e,["x","y"]),ct=(t,e)=>rt(t,e,["t","r","b","l"]),lt=()=>{},it=(t,...e)=>t.bind(0,...e),at=t=>{let e;const n=t?u:a,r=t?d:i;return [o=>{r(e),e=n(o,L(t)?t():t);},()=>r(e)]},ut=(t,e)=>{let n,r,o,s=lt;const{v:c,p:l,S:p}=e||{},f=function(e){s(),d(n),n=r=void 0,s=lt,t.apply(this,e);},h=t=>p&&r?p(r,t):t,y=()=>{s!==lt&&f(h(o)||o);},v=function(){const t=z(arguments),e=L(c)?c():c;if(S(e)&&e>=0){const c=L(l)?l():l,p=S(c)&&c>=0,v=e>0?u:a,b=e>0?d:i,w=h(t)||t,g=f.bind(0,w);s();const m=v(g,e);s=()=>b(m),p&&!n&&(n=u(y,c)),r=o=w;}else f(t);};return v.m=y,v},dt=(t,e)=>Object.prototype.hasOwnProperty.call(t,e),pt=t=>t?Object.keys(t):[],ft=(t,e,n,r,o,s,c)=>{const l=[e,n,r,o,s,c];return "object"==typeof t&&!$(t)||L(t)||(t={}),N(l,(e=>{N(e,((n,r)=>{const o=e[r];if(t===o)return !0;const s=P(o);if(o&&D(o)){const e=t[r];let n=e;s&&!P(e)?n=[]:s||D(e)||(n={}),t[r]=ft(n,o);}else t[r]=s?o.slice():o;}));})),t},ht=(t,e)=>N(ft({},t),((t,n,r)=>{void 0===t?delete r[n]:e&&t&&D(t)&&(r[n]=ht(t,e));})),yt=t=>{for(const e in t)return !1;return !0},vt=(t,e,n)=>o(t,s(e,n)),bt=t=>z(new Set((P(t)?t:(t||"").split(" ")).filter((t=>t)))),wt=(t,e)=>t&&t.getAttribute(e),gt=(t,e,n)=>{N(bt(e),(e=>{t&&t.setAttribute(e,n||"");}));},mt=(t,e)=>{N(bt(e),(e=>t&&t.removeAttribute(e)));},xt=(t,e)=>{const n=bt(wt(t,e)),r=it(gt,t,e),o=(t,e)=>{const r=new Set(n);return N(bt(t),(t=>r[e](t))),z(r).join(" ")};return {O:t=>r(o(t,"delete")),$:t=>r(o(t,"add")),C:t=>{const e=bt(t);return e.reduce(((t,e)=>t&&n.includes(e)),e.length>0)}}},$t=(t,e,n)=>{xt(t,e).O(n);},St=(t,e,n)=>(xt(t,e).$(n),it($t,t,e,n)),Ot=(t,e,n,r)=>{(r?St:$t)(t,e,n);},Tt=t=>xt(t,"class"),Lt=(t,e)=>{Tt(t).O(e);},Pt=(t,e)=>(Tt(t).$(e),it(Lt,t,e)),Et=n&&Element.prototype,Ct=(t,e)=>{const n=[],r=e?M(e)&&e:document;return r?I(n,r.querySelectorAll(t)):n},Dt=(t,e)=>!!M(t)&&(Et.matches||Et.msMatchesSelector).call(t,e),kt=t=>t?z(t.childNodes):[],Mt=t=>t&&t.parentElement,Ht=(t,e)=>M(t)&&t.closest(e),At=t=>{if(C(t))N(z(t),(t=>At(t)));else if(t){const e=Mt(t);e&&e.removeChild(t);}},Nt=(t,e,n)=>{if(n&&t){let r,o=e;return C(n)?(r=document.createDocumentFragment(),N(n,(t=>{t===o&&(o=t.previousSibling),r.appendChild(t);}))):r=n,e&&(o?o!==e&&(o=o.nextSibling):o=t.firstChild),t.insertBefore(r,o||null),()=>At(n)}return lt},Rt=(t,e)=>Nt(t,null,e),Vt=(t,e)=>Nt(Mt(t),t&&t.nextSibling,e),It=t=>{const e=document.createElement("div");return gt(e,"class",t),e},zt=t=>{const e=It();return e.innerHTML=t.trim(),N(kt(e),(t=>At(t)))},jt=/^--/,_t=(t,e)=>t.getPropertyValue(e)||t[e]||"",Ut=t=>{const e=t||0;return isFinite(e)?e:0},Bt=t=>Ut(parseFloat(t||"")),Ft=t=>`${(100*Ut(t)).toFixed(3)}%`,Zt=t=>`${Ut(t)}px`;function Xt(t,e){t&&N(e,((e,n)=>{try{const r=t.style,o=S(e)?Zt(e):(e||"")+"";jt.test(n)?r.setProperty(n,o):r[n]=o;}catch(o){}}));}function Wt(t,e,n){const o=O(e);let s=o?"":{};if(t){const c=r.getComputedStyle(t,n)||t.style;s=o?_t(c,e):e.reduce(((t,e)=>(t[e]=_t(c,e),t)),s);}return s}const Yt=t=>"rtl"===Wt(t,"direction"),qt=(t,e,n)=>{const r=e?`${e}-`:"",o=n?`-${n}`:"",s=`${r}top${o}`,c=`${r}right${o}`,l=`${r}bottom${o}`,i=`${r}left${o}`,a=Wt(t,[s,c,l,i]);return {t:Bt(a[s]),r:Bt(a[c]),b:Bt(a[l]),l:Bt(a[i])}},Gt=(t,e)=>`translate${E(t)?`(${t.x},${t.y})`:`${e?"X":"Y"}(${t})`}`,Jt={w:0,h:0},Kt=(t,e)=>e?{w:e[`${t}Width`],h:e[`${t}Height`]}:Jt,Qt=t=>Kt("inner",t||r),te=it(Kt,"offset"),ee=it(Kt,"client"),ne=it(Kt,"scroll"),re=t=>{const e=parseFloat(Wt(t,Q))||0,n=parseFloat(Wt(t,tt))||0;return {w:e-c(e),h:n-c(n)}},oe=t=>t.getBoundingClientRect(),se=t=>!(!t||!t[tt]&&!t[Q]),ce=(t,e)=>{const n=se(t);return !se(e)&&n},le=(t,e,n,r)=>{N(bt(e),(e=>{t.removeEventListener(e,n,r);}));},ie=(t,e,n,r)=>{var o;const s=null==(o=r&&r.H)||o,c=r&&r.I||!1,l=r&&r.A||!1,i={passive:s,capture:c};return it(B,bt(e).map((e=>{const r=l?o=>{le(t,e,r,c),n(o);}:n;return t.addEventListener(e,r,i),it(le,t,e,r,c)})))},ae=t=>t.stopPropagation(),ue=t=>t.preventDefault(),de={x:0,y:0},pe=t=>{const e=t&&oe(t);return e?{x:e.left+r.scrollX,y:e.top+r.scrollY}:de},fe=(t,e,n)=>n?n.n?-t+0:n.i?e-t:t:t,he=(t,e)=>[fe(0,t,e),fe(t,t,e)],ye=(t,e,n)=>vt(0,1,fe(t,e,n)/e||0),ve=(t,e)=>{const{x:n,y:r}=S(e)?{x:e,y:e}:e||{};S(n)&&(t.scrollLeft=n),S(r)&&(t.scrollTop=r);},be=t=>({x:t.scrollLeft,y:t.scrollTop}),we=(t,e)=>{N(j(e),t);},ge=t=>{const e=new Map,n=(t,n)=>{if(t){const r=e.get(t);we((t=>{r&&r[t?"delete":"clear"](t);}),n);}else e.forEach((t=>{t.clear();})),e.clear();},r=(t,o)=>{if(O(t)){const r=e.get(t)||new Set;return e.set(t,r),we((t=>{L(t)&&r.add(t);}),o),it(n,t,o)}T(o)&&o&&n();const s=pt(t),c=[];return N(s,(e=>{const n=t[e];n&&I(c,r(e,n));})),it(B,c)};return r(t||{}),[r,n,(t,n)=>{N(z(e.get(t)),(t=>{n&&!_(n)?t.apply(0,n):t();}));}]},me=t=>JSON.stringify(t,((t,e)=>{if(L(e))throw 0;return e})),xe=(t,e)=>t?`${e}`.split(".").reduce(((t,e)=>t&&dt(t,e)?t[e]:void 0),t):void 0,$e={paddingAbsolute:!1,showNativeOverlaidScrollbars:!1,update:{elementEvents:[["img","load"]],debounce:[0,33],attributes:null,ignoreMutation:null},overflow:{x:"scroll",y:"scroll"},scrollbars:{theme:"os-theme-dark",visibility:"auto",autoHide:"never",autoHideDelay:1300,autoHideSuspend:!1,dragScroll:!0,clickScroll:!1,pointers:["mouse","touch","pen"]}},Se=(t,e)=>{const n={};return N(V(pt(e),pt(t)),(r=>{const o=t[r],s=e[r];if(E(o)&&E(s))ft(n[r]={},Se(o,s)),yt(n[r])&&delete n[r];else if(dt(e,r)&&s!==o){let t=!0;if(P(o)||P(s))try{me(o)===me(s)&&(t=!1);}catch(l){}t&&(n[r]=s);}})),n},Oe=(t,e,n)=>r=>[xe(t,r),n||void 0!==xe(e,r)],Te=`data-overlayscrollbars`,Le="os-environment",Pe=`${Le}-scrollbar-hidden`,Ee=`${Te}-initialize`,Ce=Te,De=`${Ce}-overflow-x`,ke=`${Ce}-overflow-y`,Me="overflowVisible",He="scrollbarPressed",Ae="updating",Ne="body",Re=`${Te}-viewport`,Ve="arrange",Ie="scrollbarHidden",ze=Me,je=`${Te}-padding`,_e=ze,Ue=`${Te}-content`,Be="os-size-observer",Fe=`${Be}-appear`,Ze=`${Be}-listener`,Xe=`${Ze}-scroll`,We=`${Ze}-item`,Ye=`${We}-final`,qe="os-trinsic-observer",Ge="os-theme-none",Je="os-scrollbar",Ke=`${Je}-rtl`,Qe=`${Je}-horizontal`,tn=`${Je}-vertical`,en=`${Je}-track`,nn=`${Je}-handle`,rn=`${Je}-visible`,on=`${Je}-cornerless`,sn=`${Je}-transitionless`,cn=`${Je}-interaction`,ln=`${Je}-unusable`,an=`${Je}-auto-hide`,un=`${an}-hidden`,dn=`${Je}-wheel`,pn=`${en}-interactive`,fn=`${nn}-interactive`,hn={},yn={},vn=(t,e,n)=>pt(t).map((r=>{const{static:o,instance:s}=t[r],[c,l,i]=n||[],a=n?s:o;if(a){const t=n?a(c,l,e):a(e);return (i||yn)[r]=t}})),bn=t=>yn[t],wn="__osOptionsValidationPlugin",gn="__osSizeObserverPlugin",mn=(()=>({[gn]:{static:()=>(t,e,n)=>{const r=3333333,o="scroll",s=zt(`<div class="${We}" dir="ltr"><div class="${We}"><div class="${Ye}"></div></div><div class="${We}"><div class="${Ye}" style="width: 200%; height: 200%"></div></div></div>`),c=s[0],l=c.lastChild,u=c.firstChild,d=null==u?void 0:u.firstChild;let p,f=te(c),h=f,y=!1;const v=()=>{ve(u,r),ve(l,r);},b=t=>{p=0,y&&(f=h,e(!0===t));},w=t=>{h=te(c),y=!t||!ot(h,f),t?(ae(t),y&&!p&&(i(p),p=a(b))):b(!1===t),v();},g=[Rt(t,s),ie(u,o,w),ie(l,o,w)];return Pt(t,Xe),Xt(d,{[Q]:r,[tt]:r}),a(v),[n?it(w,!1):v,g]}}}))(),xn=(t,e)=>{const{T:n}=e,[r,o]=t("showNativeOverlaidScrollbars");return [r&&n.x&&n.y,o]},$n=t=>0===t.indexOf(nt),Sn=(t,e)=>{const{D:n}=t,r=t=>{const r=Wt(n,t);return [r,"scroll"===(e?e[t]:r)]},[o,s]=r(J),[c,l]=r(K);return {k:{x:o,y:c},R:{x:s,y:l}}},On=(t,e,n,r)=>{const o=e.x||e.y,s=(t,e)=>{const n=$n(t),r=n&&o?"hidden":"",s=e&&n&&t.replace(`${nt}-`,"")||r;return [e&&!n?t:"",$n(s)?"hidden":s]},[c,l]=s(n.x,e.x),[i,a]=s(n.y,e.y);return r[J]=l&&i?l:c,r[K]=a&&c?a:i,Sn(t,r)},Tn="__osScrollbarsHidingPlugin",Ln=(()=>({[Tn]:{static:()=>({M:(t,e,n,r,o)=>{const{V:s,D:c}=t,{L:l,T:i,P:a}=r,u=!s&&!l&&(i.x||i.y),[d]=xn(o,r),p=t=>{const{R:e}=t,n=l||d?0:42,r=(t,e,r)=>[e&&!l?t?n:r:0,t&&!!n],[o,s]=r(i.x,e.x,a.x),[c,u]=r(i.y,e.y,a.y);return {U:{x:o,y:c},B:{x:s,y:u}}},f=(t,{N:n},r,o)=>{if(ft(o,{[q]:0,[G]:0,[Y]:0}),!s){const{U:s,B:c}=p(t),{x:l,y:i}=c,{x:a,y:u}=s,{j:d}=e,f=n?Y:q,h=n?X:Z,y=d[f],v=d[G],b=d[h],w=d[W];o[Q]=`calc(100% + ${u+-1*y}px)`,o[f]=-u+y,o[G]=-a+v,r&&(o[h]=b+(i?u:0),o[W]=w+(l?a:0));}};return {F:p,q:(t,r,o)=>{if(u){const{j:s}=e,{U:l,B:i}=p(t),{x:a,y:u}=i,{x:d,y:f}=l,{N:h}=n,y=s[h?Z:X],v=s.paddingTop,b=r.w+o.w,w=r.h+o.h,g={w:f&&u?`${f+b-y}px`:"",h:d&&a?`${d+w-v}px`:""};Xt(c,{"--os-vaw":g.w,"--os-vah":g.h});}return u},W:r=>{if(u){const o=r||Sn(t),{j:s}=e,{B:l}=p(o),{x:i,y:a}=l,d={},h=t=>N(t,(t=>{d[t]=s[t];}));i&&h([G,F,W]),a&&h([Y,q,X,Z]);const y=Wt(c,pt(d));return $t(c,Re,Ve),Xt(c,d),[()=>{f(o,n,u,y),Xt(c,y),St(c,Re,Ve);},o]}return [lt]},X:f}},Y:()=>{let t={w:0,h:0},e=0;const n=()=>{const t=r.screen,e=t.deviceXDPI||0,n=t.logicalXDPI||1;return r.devicePixelRatio||e/n};return (r,o)=>{const s=Qt(),i={w:s.w-t.w,h:s.h-t.h};if(0===i.w&&0===i.h)return;const a=l(i.w),u=l(i.h),d={w:l(c(s.w/(t.w/100))),h:l(c(s.h/(t.h/100)))},p=n(),f=a>2&&u>2,h=!((t,e)=>{const n=l(t),r=l(e);return !(n===r||n+1===r||n-1===r)})(d.w,d.h);let y,v;return f&&h&&p!==e&&p>0&&([v,y]=o(),ft(r.P,v)),t=s,e=p,y}}})}}))(),Pn="__osClickScrollPlugin",En=(()=>({[Pn]:{static:()=>(t,e,n,r,o)=>{let s=0,c=lt;const l=i=>{c=A(i,i+r*Math.sign(n),133,((n,i,a)=>{t(n);const d=e();if(a&&!(o>=d&&o<=d+r)){if(s)l(n);else {const t=u((()=>{l(n);}),222);c=()=>{clearTimeout(t);};}s++;}}));};return l(0),()=>c()}}}))();let Cn;const Dn=()=>(Cn||(Cn=(()=>{const t=(t,e,n,r)=>{Rt(t,e);const o=ee(e),s=te(e),c=re(n);return r&&At(e),{x:s.h-o.h+c.h,y:s.w-o.w+c.w}},{body:n}=document,o=zt(`<div class="${Le}"><div></div></div>`)[0],s=o.firstChild,[c,,l]=ge(),[i,a]=e({o:t(n,o,s),u:st},it(t,n,o,s,!0)),[u]=a(),d=(t=>{let e=!1;const n=Pt(t,Pe);try{e="none"===Wt(t,"scrollbar-width")||"none"===Wt(t,"display","::-webkit-scrollbar");}catch(o){}return n(),e})(o),p={x:0===u.x,y:0===u.y},f={elements:{host:null,padding:!d,viewport:t=>d&&t===t.ownerDocument.body&&t,content:!1},scrollbars:{slot:!0},cancel:{nativeScrollbarsOverlaid:!1,body:null}},h=ft({},$e),y=it(ft,{},h),b=it(ft,{},f),w={P:u,T:p,L:d,G:!!v,J:((t,e)=>{Xt(t,{[J]:et,[K]:et,direction:"rtl"}),ve(t,{x:0});const n=pe(t),r=pe(e);ve(t,{x:-999});const o=pe(e);return {i:n.x===r.x,n:r.x!==o.x}})(o,s),K:it(c,"r"),Z:b,tt:t=>ft(f,t)&&b(),nt:y,ot:t=>ft(h,t)&&y(),st:ft({},f),et:ft({},h)};return mt(o,"style"),At(o),r.addEventListener("resize",(()=>{let t;if(!(d||p.x&&p.y)){const e=bn(Tn);t=!!(e?e.Y():lt)(w,i);}l("r",[t]);})),w})()),Cn),kn=(t,e)=>L(e)?e.apply(0,t):e,Mn=(t,e,n,r)=>{const o=x(r)?n:r;return kn(t,o)||e.apply(0,t)},Hn=(t,e,n,r)=>{const o=x(r)?n:r,s=kn(t,o);return !!s&&(k(s)?s:e.apply(0,t))},An=new WeakMap,Nn=t=>An.get(t),Rn=(t,e,n,r)=>{let o=!1;const{ct:s,rt:c,lt:l,it:i,ut:a,ft:u}=r||{},d=ut((()=>o&&n(!0)),{v:33,p:99}),[p,h]=((t,e,n)=>{let r=!1;const o=!!n&&new WeakMap,s=s=>{if(o&&n){const c=n.map((e=>{const[n,r]=e||[];return [r&&n?(s||Ct)(n,t):[],r]}));N(c,(n=>N(n[0],(s=>{const c=n[1],l=o.get(s)||[];if(t.contains(s)&&c){const t=ie(s,c,(n=>{r?(t(),o.delete(s)):e(n);}));o.set(s,I(l,t));}else B(l),o.delete(s);}))));}};return s(),[()=>{r=!0;},s]})(t,d,l),y=c||[],v=V(s||[],y),b=(o,s)=>{if(!_(s)){const c=a||lt,l=u||lt,d=[],p=[];let f=!1,v=!1;if(N(s,(n=>{const{attributeName:o,target:s,type:a,oldValue:u,addedNodes:h,removedNodes:b}=n,w="attributes"===a,g="childList"===a,m=t===s,x=w&&o,$=x&&wt(s,o||"")||null,S=x&&u!==$,O=R(y,o)&&S;if(e&&(g||!m)){const e=w&&S,a=e&&i&&Dt(s,i),p=(a?!c(s,o,u,$):!w||e)&&!l(n,!!a,t,r);N(h,(t=>I(d,t))),N(b,(t=>I(d,t))),v=v||p;}!e&&m&&S&&!c(s,o,u,$)&&(I(p,o),f=f||O);})),h((t=>U(d).reduce(((e,n)=>(I(e,Ct(t,n)),Dt(n,t)?I(e,n):e)),[]))),e)return !o&&v&&n(!1),[!1];if(!_(p)||f){const t=[U(p),f];return !o&&n.apply(0,t),t}}},w=new f(it(b,!1));return [()=>(w.observe(t,{attributes:!0,attributeOldValue:!0,attributeFilter:v,subtree:e,childList:e,characterData:e}),o=!0,()=>{o&&(p(),w.disconnect(),o=!1);}),()=>{if(o)return d.m(),b(!0,w.takeRecords())}]},Vn=(t,n,r)=>{const o=3333333,{_t:s,dt:c}=r||{},l=bn(gn),{J:i}=Dn(),a=it(Yt,t),[u]=e({o:!1,_:!0});return ()=>{const r=[],d=zt(`<div class="${Be}"><div class="${Ze}"></div></div>`)[0],p=d.firstChild,f=t=>{const e=t instanceof ResizeObserverEntry,r=!e&&P(t);let c=!1,l=!1,a=!0;if(e){const[e,,n]=u(t.contentRect),r=se(e),o=ce(e,n);l=!n||o,c=!l&&!r,a=!c;}else r?[,a]=t:l=!0===t;if(s&&a){const e=r?t[0]:Yt(d);ve(d,{x:fe(o,o,e&&i),y:o});}c||n({vt:r?t:void 0,ht:!r,dt:l});};if(y){const t=new y((t=>f(t.pop())));t.observe(p),I(r,(()=>{t.disconnect();}));}else {if(!l)return lt;{const[t,e]=l(p,f,c);I(r,V([Pt(d,Fe),ie(d,"animationstart",t)],e));}}if(s){const[t]=e({o:void 0},a);I(r,ie(d,"scroll",(e=>{const n=t(),[r,o,s]=n;o&&(Lt(p,"ltr rtl"),Pt(p,r?"rtl":"ltr"),f([!!r,o,s])),ae(e);})));}return it(B,I(r,Rt(t,d)))}},In=(t,n)=>{let r;const o=It(qe),[s]=e({o:!1}),c=(t,e)=>{if(t){const r=s((t=>0===t.h||t.isIntersecting||t.intersectionRatio>0)(t)),[,o]=r;return o&&!e&&n(r)&&[r]}},l=(t,e)=>c(e.pop(),t);return [()=>{const e=[];if(h)r=new h(it(l,!1),{root:t}),r.observe(o),I(e,(()=>{r.disconnect();}));else {const t=()=>{const t=te(o);c(t);};I(e,Vn(o,t)()),t();}return it(B,I(e,Rt(t,o)))},()=>r&&l(!0,r.takeRecords())]},zn=(t,n,r,o)=>{let s,c,l,i,a,u;const{L:d}=Dn(),p=`[${Ce}]`,f=`[${Re}]`,h=["tabindex"],v=["wrap","cols","rows"],b=["id","class","style","open"],{gt:w,bt:g,D:m,wt:x,St:$,V:T,yt:E,Ot:C}=t,D={$t:!1,N:Yt(w)},k=Dn(),H=bn(Tn),[A]=e({u:ot,o:{w:0,h:0}},(()=>{const e=H&&H.M(t,n,D,k,r).W,o=E(ze),s=!T&&E(Ve),c=s&&be(m);C(ze),T&&C(Ae,!0);const l=s&&e&&e()[0],i=ne(x),a=ne(m),u=re(m);return C(ze,o),T&&C(Ae),l&&l(),ve(m,c),{w:a.w+i.w+u.w,h:a.h+i.h+u.h}})),I=$?v:V(b,v),z=ut(o,{v:()=>s,p:()=>c,S(t,e){const[n]=t,[r]=e;return [V(pt(n),pt(r)).reduce(((t,e)=>(t[e]=n[e]||r[e],t)),{})]}}),j=t=>{if(T){const e=Yt(w);ft(t,{Ct:u!==e}),ft(D,{N:e}),u=e;}},_=t=>{N(t||h,(t=>{if(R(h,t)){const e=wt(g,t);O(e)?gt(m,t,e):mt(m,t);}}));},U=(t,e)=>{const[n,r]=t,s={xt:r};return ft(D,{$t:n}),!e&&o(s),s},B=({ht:t,vt:e,dt:n})=>{const r=(!t||n||e)&&d?z:o,[s,c]=e||[],l={ht:t||n,dt:n,Ct:c};j(l),e&&ft(D,{N:s}),r(l);},F=(t,e)=>{const[,n]=A(),r={Ht:n};return j(r),n&&!e&&(t?o:z)(r),r},Z=(t,e,n)=>{const r={It:e};return j(r),e&&!n?z(r):T||_(t),r},{K:X}=k,[W,Y]=x?In(g,U):[],q=!T&&Vn(g,B,{dt:!0,_t:!0}),[G,J]=Rn(g,!1,Z,{rt:b,ct:V(b,h)}),K=T&&y&&new y((t=>{const e=t[t.length-1].contentRect;B({ht:!0,dt:ce(e,a)}),a=e;}));return [()=>{_(),K&&K.observe(g);const t=q&&q(),e=W&&W(),n=G(),r=X((t=>{const[,e]=A();z({zt:t,Ht:e});}));return ()=>{K&&K.disconnect(),t&&t(),e&&e(),i&&i(),n(),r();}},({Et:t,At:e,Tt:n})=>{const r={},[o]=t("update.ignoreMutation"),[a,u]=t("update.attributes"),[d,h]=t("update.elementEvents"),[y,v]=t("update.debounce"),b=e||n;if(h||u){l&&l(),i&&i();const[t,e]=Rn(x||m,!0,F,{ct:V(I,a||[]),lt:d,it:p,ft:(t,e)=>{const{target:n,attributeName:r}=t;return !(e||!r||T)&&((t,e,n)=>{const r=Ht(t,e),o=t&&((t,e)=>{const n=e?M(e)&&e:document;return n?n.querySelector(t):null})(n,r),s=Ht(o,e)===r;return !(!r||!o)&&(r===t||o===t||s&&Ht(Ht(t,n),e)!==r)})(n,p,f)||!!Ht(n,`.${Je}`)||!!(t=>L(o)&&o(t))(t)}});i=t(),l=e;}if(v)if(z.m(),P(y)){const t=y[0],e=y[1];s=S(t)&&t,c=S(e)&&e;}else S(y)?(s=y,c=!1):(s=!1,c=!1);if(b){const t=J(),e=Y&&Y(),n=l&&l();t&&ft(r,Z(t[0],t[1],b)),e&&ft(r,U(e[0],b)),n&&ft(r,F(n[0],b));}return j(r),r},D]},jn=(t,e,n,r)=>{const{Z:o,J:s}=Dn(),{scrollbars:c}=o(),{slot:l}=c,{gt:i,bt:a,D:d,Dt:p,kt:f,Rt:h,V:y}=e,{scrollbars:b}=p?{}:t,{slot:w}=b||{},g=new Map,m=t=>v&&new v({source:f,axis:t}),x=m("x"),$=m("y"),S=Hn([i,a,d],(()=>y&&h?i:a),l,w),O=(t,e)=>{if(e){const n=t?Q:tt,{Mt:r,Vt:o}=e,s=oe(o)[n],c=oe(r)[n];return vt(0,1,s/c||0)}const r=t?"x":"y",{Lt:o,Pt:s}=n,c=s[r],l=o[r];return vt(0,1,c/(c+l)||0)},L=(t,e)=>ft(t,e?{clear:["left"]}:{}),P=t=>{g.forEach(((e,n)=>{(!t||R(j(t),n))&&(N(e||[],(t=>{t&&t.cancel();})),g.delete(n));}));},E=(t,e,n,r)=>{const o=g.get(t)||[],s=o.find((t=>t&&t.timeline===e));s?s.effect=new KeyframeEffect(t,n,{composite:r}):g.set(t,V(o,[t.animate(n,{timeline:e,composite:r})]));},C=(t,e,n)=>{const r=n?Pt:Lt;N(t,(t=>{r(t.Ut,e);}));},D=(t,e)=>{N(t,(t=>{const[n,r]=e(t);Xt(n,r);}));},k=(t,e)=>{D(t,(t=>{const{Vt:n}=t;return [n,{[e?Q:tt]:Ft(O(e))}]}));},M=(t,e)=>{const{Lt:r}=n,o=e?r.x:r.y,c=(t,n,r)=>Gt(Ft(((t,e,n,r)=>{const o=O(n,t);return 1/o*(1-o)*(r?1-e:e)||0})(t,ye(n,o,r),e,r)),e);if(x&&$)N(t,(t=>{const{Ut:n,Vt:r}=t,l=e&&Yt(n)&&s;E(r,e?x:$,L({transform:he(o,l).map((e=>c(t,e,l)))},l));}));else {const n=be(f);D(t,(t=>{const{Vt:r,Ut:o}=t;return [r,{transform:c(t,e?n.x:n.y,e&&Yt(o)&&s)}]}));}},H=t=>y&&!h&&Mt(t)===d,A=[],z=[],U=[],F=(t,e,n)=>{const r=T(n),o=!r||!n;(!r||n)&&C(z,t,e),o&&C(U,t,e);},Z=t=>{const e=t?Qe:tn,n=t?z:U,o=_(n)?sn:"",s=It(`${Je} ${e} ${o}`),c=It(en),l=It(nn),i={Ut:s,Mt:c,Vt:l};return I(n,i),I(A,[Rt(s,c),Rt(c,l),it(At,s),P,r(i,F,M,t)]),i},X=it(Z,!0),W=it(Z,!1);return X(),W(),[{Bt:()=>{k(z,!0),k(U);},Nt:()=>{M(z,!0),M(U);},jt:()=>{if(y){const{Lt:t}=n,e=.5;if(x&&$)N(V(U,z),(({Ut:n})=>{if(H(n)){const r=(t,r,o)=>{const c=o&&Yt(n)&&s;E(n,t,L({transform:he(r-e,c).map((t=>Gt(Zt(t),o)))},c),"add");};r(x,t.x,!0),r($,t.y);}else P(n);}));else {const e=be(f),n=n=>{const{Ut:r}=n,o=H(r)&&r,c=(t,e,n)=>{const r=e*ye(t,e,n);return Zt(n?-r:r)};return [o,{transform:o?Gt({x:c(e.x,t.x,Yt(r)&&s),y:c(e.y,t.y)}):""}]};D(z,n),D(U,n);}}},Ft:F,qt:{G:x,Wt:z,Xt:X,Yt:it(D,z)},Gt:{G:$,Wt:U,Xt:W,Yt:it(D,U)}},()=>(Rt(S,z[0].Ut),Rt(S,U[0].Ut),u((()=>{F(sn);}),300),it(B,A))]},_n=(t,e,n)=>{const{bt:r,kt:o,Jt:s}=e;return (e,l,i,a)=>{const{Ut:u,Mt:d,Vt:p}=e,[f,h]=at(333),[y,v]=at(),b=it(i,[e],a),w=!!o.scrollBy,g=`client${a?"X":"Y"}`,m=a?Q:tt,x=a?"left":"top",$=a?"w":"h",S=a?"x":"y",O=t=>t.propertyName.indexOf(m)>-1;let T=!0;return it(B,[ie(u,"pointerenter",(()=>{l(cn,!0);})),ie(u,"pointerleave pointercancel",(()=>{l(cn,!1);})),ie(u,"wheel",(t=>{const{deltaX:e,deltaY:n,deltaMode:s}=t;w&&T&&0===s&&Mt(u)===r&&o.scrollBy({left:e,top:n,behavior:"smooth"}),T=!1,l(dn,!0),f((()=>{T=!0,l(dn);})),ue(t);}),{H:!1,I:!0}),ie(p,"transitionstart",(t=>{if(O(t)){const t=()=>{b(),y(t);};t();}})),ie(p,"transitionend transitioncancel",(t=>{O(t)&&(v(),b());})),ie(u,"mousedown",it(ie,s,"click",ae,{A:!0,I:!0}),{I:!0}),(()=>{const e="pointerup pointerleave pointercancel lostpointercapture",l=(t,e)=>r=>{const{Lt:s}=n,c=te(d)[$]-te(p)[$],l=e*r/c*s[S];ve(o,{[S]:t+l});};return ie(d,"pointerdown",(n=>{const i=Ht(n.target,`.${nn}`)===p,a=i?p:d,u=t.scrollbars,{button:f,isPrimary:h,pointerType:y}=n,{pointers:v}=u;if(0===f&&h&&u[i?"dragScroll":"clickScroll"]&&(v||[]).includes(y)){const t=!i&&n.shiftKey,u=it(oe,p),f=it(oe,d),h=(t,e)=>(t||u())[x]-(e||f())[x],y=c(oe(o)[m])/te(o)[$]||1,v=l(be(o)[S]||0,1/y),b=n[g],w=u(),O=f(),T=w[m],L=h(w,O)+T/2,P=b-O[x],E=i?0:P-L,C=t=>{B(D),a.releasePointerCapture(t.pointerId);},D=[St(r,Ce,He),ie(s,e,C),ie(s,"selectstart",(t=>ue(t)),{H:!1}),ie(d,e,C),ie(d,"pointermove",(e=>{const n=e[g]-b;(i||t)&&v(E+n);}))];if(a.setPointerCapture(n.pointerId),t)v(E);else if(!i){const t=bn(Pn);t&&I(D,t(v,h,E,T,P));}}}))})(),h,v])}},Un=({wt:t})=>({Zt:e,un:n,Tt:r})=>{const{xt:o}=e||{},{$t:s}=n;t&&(o||r)&&Xt(t,{[tt]:s&&"100%"});},Bn=({bt:t,cn:n,D:r,V:o},s)=>{const[c,l]=e({u:ct,o:qt()},it(qt,t,"padding",""));return ({Et:t,Zt:e,un:i,Tt:a})=>{let[u,d]=l(a);const{L:p}=Dn(),{ht:f,Ht:h,Ct:y}=e||{},{N:v}=i,[b,w]=t("paddingAbsolute");(f||d||a||h)&&([u,d]=c(a));const g=!o&&(w||y||d);if(g){const t=!b||!n&&!p,e=u.r+u.l,o=u.t+u.b,c={[q]:t&&!v?-e:0,[G]:t?-o:0,[Y]:t&&v?-e:0,top:t?-u.t:0,right:t?v?-u.r:"auto":0,left:t?v?"auto":-u.l:0,[Q]:t&&`calc(100% + ${e}px)`},l={[F]:t?u.t:0,[Z]:t?u.r:0,[W]:t?u.b:0,[X]:t?u.l:0};Xt(n||r,c),Xt(r,l),ft(s,{cn:u,fn:!t,j:n?l:ft({},c,l)});}return {_n:g}}},Fn=(t,n)=>{const s=Dn(),{bt:c,cn:l,D:i,V:a,Ot:u,Rt:d,ln:p}=t,{L:f,T:h}=s,y=d&&a,v=it(o,0),b={u:ot,o:{w:0,h:0}},w={u:st,o:{x:et,y:et}},g=(t,e)=>{const n=r.devicePixelRatio%1!=0?1:0,o={w:v(t.w-e.w),h:v(t.h-e.h)};return {w:o.w>n?o.w:0,h:o.h>n?o.h:0}},[m,x]=e(b,it(re,i)),[$,S]=e(b,it(ne,i)),[O,T]=e(b),[L,P]=e(b),[E]=e(w),C=bn(Tn);return ({Et:e,Zt:r,un:d,Tt:b},{_n:w})=>{const{ht:D,It:k,Ht:M,xt:H,Ct:A,zt:N}=r||{},{$t:R}=d,V=C&&C.M(t,n,d,s,e),{q:I,W:z,X:j,F:_}=V||{},U=(t,e)=>{if(Xt(i,{[tt]:""}),e){const{fn:e,cn:r}=n,{R:o}=t,s=re(c),l=ee(c),a="content-box"===Wt(i,"boxSizing"),u=e||a?r.b+r.t:0,d=!(h.x&&a);Xt(i,{[tt]:l.h+s.h+(o.x&&d&&_?_(t).U.x:0)-u});}},[B,F]=xn(e,s),[Z,X]=e("overflow"),W=!a&&(D||M||k||F||H),Y=D||w||M||A||N||F,q=$n(Z.x),G=$n(Z.y),Q=q||G;let et,nt=x(b),rt=S(b),ot=T(b),st=P(b);if(F&&f&&u(Ie,!B),W&&(et=Sn(t),U(et,R)),Y){Q&&u(ze,!1);const[t,e]=z?z(et):[],[n,r]=nt=m(b),[s,c]=rt=$(b),l=ee(i),a=s,d=l;t&&t(),(c||r||F)&&e&&!B&&I&&I(e,s,n);const f=Qt(p),h={w:v(o(s.w,a.w)+n.w),h:v(o(s.h,a.h)+n.h)},w={w:v((y?f.w:d.w+v(l.w-s.w))+n.w),h:v((y?f.h:d.h+v(l.h-s.h))+n.h)};st=L(w),ot=O(g(h,w),b);}const[ct,lt]=st,[it,at]=ot,[ut,dt]=rt,[pt,ht]=nt,yt={x:it.w>0,y:it.h>0},vt=q&&G&&(yt.x||yt.y)||q&&yt.x&&!yt.y||G&&yt.y&&!yt.x;if(w||A||N||ht||dt||lt||at||X||F||W||Y){const e={},n=On(t,yt,Z,e);j&&j(n,d,!!I&&I(n,ut,pt),e),W&&U(n,R),a?(gt(c,De,e[J]),gt(c,ke,e[K])):Xt(i,e);}Ot(c,Ce,Me,vt),Ot(l,je,_e,vt),a||Ot(i,Re,ze,Q);const[bt,wt]=E(Sn(t).k);return ft(n,{k:bt,Pt:{x:ct.w,y:ct.h},Lt:{x:it.w,y:it.h},en:yt}),{sn:wt,tn:lt,nn:at}}},Zn=(t,e,n,r)=>{const o=Oe(e,{}),[s,c,l,i,a]=(t=>{const[e,n,r]=(t=>{const e=Dn(),{Z:n,L:r}=e,{elements:o}=n(),{host:s,padding:c,viewport:l,content:i}=o,a=k(t),u=a?{}:t,{elements:d}=u,{host:p,padding:f,viewport:h,content:y}=d||{},v=a?t:u.target,b=Dt(v,"textarea"),w=v.ownerDocument,g=w.documentElement,m=v===w.body,x=w.defaultView,$=()=>w.activeElement,S=t=>{t&&t.focus&&t.focus();},O=it(Mn,[v]),T=it(Hn,[v]),L=it(kn,[v]),P=it(It,""),E=it(O,P,l),C=it(T,P,i),D=E(h),M=D===v,H=M&&m,A=!M&&C(y),N=!M&&k(D)&&D===A,V=N&&!!L(i),z=V?E():D,j=V?A:C(),_=H?g:N?z:D,U=b?O(P,s,p):v,F=N?j:A,Z={gt:v,bt:H?_:U,D:_,cn:!M&&T(P,c,f),wt:F,kt:H?g:_,Kt:H?w:_,rn:m?g:v,ln:x,Jt:w,St:b,Rt:m,Dt:a,V:M,an:N,yt:t=>((t,e,n)=>xt(t,e).C(n))(_,M?Ce:Re,t),Ot:(t,e)=>Ot(_,M?Ce:Re,t,e)},X=pt(Z).reduce(((t,e)=>{const n=Z[e];return I(t,!(!n||!k(n)||Mt(n))&&n)}),[]),W=t=>t?R(X,t):null,{gt:Y,bt:q,cn:G,D:J,wt:K}=Z,Q=[()=>{mt(q,[Ce,Ee]),mt(Y,Ee),m&&mt(g,[Ee,Ce]);}],tt=b&&W(q);let et=b?Y:kt([K,J,G,q,Y].find((t=>!1===W(t))));const nt=H?Y:K||J,rt=it(B,Q);return [Z,()=>{const t=$(),e=t=>{Rt(Mt(t),kt(t)),At(t);},n=t=>t?ie(t,"focus blur",(t=>{ae(t),t.stopImmediatePropagation();}),{I:!0,H:!1}):lt,o=n(t);if(gt(q,Ce,M?"viewport":"host"),gt(G,je,""),gt(K,Ue,""),M||(gt(J,Re,""),m&&St(g,Ce,Ne)),tt&&(Vt(Y,q),I(Q,(()=>{Vt(q,Y),At(q);}))),Rt(nt,et),Rt(q,G),Rt(G||q,!M&&J),Rt(J,K),I(Q,[o,()=>{const t=$(),r=n(t);mt(G,je),mt(K,Ue),mt(J,[De,ke,Re]),W(K)&&e(K),W(J)&&e(J),W(G)&&e(G),S(t),r();}]),r&&!M&&(St(J,Re,Ie),I(Q,it(mt,J,Re))),M||x.top!==x||t!==v)S(t);else {const t="tabindex",e=wt(J,t);gt(J,t,"-1"),S(J);const n=()=>e?gt(J,t,e):mt(J,t),r=ie(w,"pointerdown keydown",(()=>{n(),r();}));I(Q,[n,r]);}return o(),et=0,rt},rt]})(t),o={cn:{t:0,r:0,b:0,l:0},fn:!1,j:{[q]:0,[G]:0,[Y]:0,[F]:0,[Z]:0,[W]:0,[X]:0},Pt:{x:0,y:0},Lt:{x:0,y:0},k:{x:et,y:et},en:{x:!1,y:!1}},{gt:s,D:c,V:l}=e,{L:i,T:a}=Dn(),u=!i&&(a.x||a.y),d=[Un(e),Bn(e,o),Fn(e,o)];return [n,t=>{const e={},n=u&&be(c),r=l?St(c,Ce,Ae):lt;return N(d,(n=>{ft(e,n(t,e)||{});})),r(),ve(c,n),!l&&ve(s,0),e},o,e,r]})(t),[u,d,p]=zn(i,l,o,(t=>{b({},t);})),[f,h,,y]=((t,e,n,r,o,s)=>{let c,l,i,a,u,d=lt,p=0;const[f,h]=at(),[y,v]=at(),[b,w]=at(100),[g,m]=at(100),[x,$]=at(100),[S,O]=at((()=>p)),[T,L]=jn(t,o,r,_n(e,o,r)),{bt:P,Kt:E,Rt:C}=o,{Ft:D,Bt:k,Nt:M,jt:H}=T,A=t=>{D(an,t,!0),D(an,t,!1);},N=(t,e)=>{if(O(),t)D(un);else {const t=it(D,un,!0);p>0&&!e?S(t):t();}},R=t=>"mouse"===t.pointerType,V=t=>{R(t)&&(a=l,a&&N(!0));},z=[w,O,m,$,v,h,()=>d(),ie(P,"pointerover",V,{A:!0}),ie(P,"pointerenter",V),ie(P,"pointerleave",(t=>{R(t)&&(a=!1,l&&N(!1));})),ie(P,"pointermove",(t=>{R(t)&&c&&f((()=>{w(),N(!0),g((()=>{c&&N(!1);}));}));})),ie(E,"scroll",(t=>{y((()=>{M(),i&&N(!0),b((()=>{i&&!a&&N(!1);}));})),s(t),H();}))];return [()=>it(B,I(z,L())),({Et:t,Tt:e,Zt:o,Qt:s})=>{const{tn:a,nn:f,sn:h}=s||{},{Ct:y,dt:v}=o||{},{N:b}=n,{T:w}=Dn(),{Lt:g,k:m,en:$}=r,[S,O]=t("showNativeOverlaidScrollbars"),[T,L]=t("scrollbars.theme"),[P,R]=t("scrollbars.visibility"),[V,I]=t("scrollbars.autoHide"),[z,j]=t("scrollbars.autoHideSuspend"),[_]=t("scrollbars.autoHideDelay"),[U,B]=t("scrollbars.dragScroll"),[F,Z]=t("scrollbars.clickScroll"),X=v&&!e,W=$.x||$.y,Y=a||f||y||e,q=h||R,G=S&&w.x&&w.y,J=(t,e)=>{const n="visible"===P||"auto"===P&&"scroll"===t;return D(rn,n,e),n};if(p=_,X&&(z&&W?(A(!1),d(),x((()=>{d=ie(E,"scroll",it(A,!0),{A:!0});}))):A(!0)),O&&D(Ge,G),L&&(D(u),D(T,!0),u=T),j&&!z&&A(!0),I&&(c="move"===V,l="leave"===V,i="never"!==V,N(!i,!0)),B&&D(fn,U),Z&&D(pn,F),q){const t=J(m.x,!0),e=J(m.y,!1);D(on,!(t&&e));}Y&&(k(),M(),H(),D(ln,!g.x,!0),D(ln,!g.y,!1),D(Ke,b&&!C));},{},T]})(t,e,p,l,i,r),v=t=>pt(t).some((e=>!!t[e])),b=(t,r)=>{const{dn:o,Tt:s,At:l,vn:i}=t,a=o||{},u=!!s,f={Et:Oe(e,a,u),dn:a,Tt:u};if(i)return h(f),!1;const y=r||d(ft({},f,{At:l})),b=c(ft({},f,{un:p,Zt:y}));h(ft({},f,{Zt:y,Qt:b}));const w=v(y),g=v(b),m=w||g||!yt(a)||u;return m&&n(t,{Zt:y,Qt:b}),m};return [()=>{const{rn:t,D:e}=i,n=be(t),r=[u(),s(),f()];return ve(e,n),it(B,r)},b,()=>({hn:p,pn:l}),{gn:i,bn:y},a]},Xn=(t,e,n)=>{const{nt:r}=Dn(),o=k(t),s=o?t:t.target,c=Nn(s);if(e&&!c){let c=!1;const l=[],i={},a=t=>{const e=ht(t,!0),n=bn(wn);return n?n(e,!0):e},u=ft({},r(),a(e)),[d,p,f]=ge(),[h,y,v]=ge(n),b=(t,e)=>{v(t,e),f(t,e);},[w,g,m,S,O]=Zn(t,u,(({dn:t,Tt:e},{Zt:n,Qt:r})=>{const{ht:o,Ct:s,xt:c,Ht:l,It:i,dt:a}=n,{tn:u,nn:d,sn:p}=r;b("updated",[L,{updateHints:{sizeChanged:!!o,directionChanged:!!s,heightIntrinsicChanged:!!c,overflowEdgeChanged:!!u,overflowAmountChanged:!!d,overflowStyleChanged:!!p,contentMutation:!!l,hostMutation:!!i,appear:!!a},changedOptions:t||{},force:!!e}]);}),(t=>b("scroll",[L,t]))),T=t=>{(t=>{An.delete(t);})(s),B(l),c=!0,b("destroyed",[L,t]),p(),y();},L={options(t,e){if(t){const n=e?r():{},o=Se(u,ft(n,a(t)));yt(o)||(ft(u,o),g({dn:o}));}return ft({},u)},on:h,off:(t,e)=>{t&&e&&y(t,e);},state(){const{hn:t,pn:e}=m(),{N:n}=t,{Pt:r,Lt:o,k:s,en:l,cn:i,fn:a}=e;return ft({},{overflowEdge:r,overflowAmount:o,overflowStyle:s,hasOverflow:l,padding:i,paddingAbsolute:a,directionRTL:n,destroyed:c})},elements(){const{gt:t,bt:e,cn:n,D:r,wt:o,kt:s,Kt:c}=S.gn,{qt:l,Gt:i}=S.bn,a=t=>{const{Vt:e,Mt:n,Ut:r}=t;return {scrollbar:r,track:n,handle:e}},u=t=>{const{Wt:e,Xt:n}=t,r=a(e[0]);return ft({},r,{clone:()=>{const t=a(n());return g({vn:!0}),t}})};return ft({},{target:t,host:e,padding:n||r,viewport:r,content:o||r,scrollOffsetElement:s,scrollEventElement:c,scrollbarHorizontal:u(l),scrollbarVertical:u(i)})},update:t=>g({Tt:t,At:!0}),destroy:it(T,!1),plugin:t=>i[pt(t)[0]]};return I(l,[O]),((t,e)=>{An.set(t,e);})(s,L),vn(hn,Xn,[L,d,i]),((t,e)=>{const{nativeScrollbarsOverlaid:n,body:r}=e||{},{T:o,L:s,Z:c}=Dn(),{nativeScrollbarsOverlaid:l,body:i}=c().cancel,a=null!=n?n:l,u=x(r)?i:r,d=(o.x||o.y)&&a,p=t&&($(u)?!s:u);return !!d||!!p})(S.gn.Rt,!o&&t.cancel)?(T(!0),L):(I(l,w()),b("initialized",[L]),L.update(!0),L)}return c};return Xn.plugin=t=>{const e=P(t),n=e?t:[t],r=n.map((t=>vn(t,Xn)[0]));return (t=>{N(t,(t=>N(t,((e,n)=>{hn[n]=t[n];}))));})(n),e?r:r[0]},Xn.valid=t=>{const e=t&&t.elements,n=L(e)&&e();return D(n)&&!!Nn(n.target)},Xn.env=()=>{const{P:t,T:e,L:n,J:r,G:o,st:s,et:c,Z:l,tt:i,nt:a,ot:u}=Dn();return ft({},{scrollbarsSize:t,scrollbarsOverlaid:e,scrollbarsHiding:n,rtlScrollBehavior:r,scrollTimeline:o,staticDefaultInitialization:s,staticDefaultOptions:c,getDefaultInitialization:l,setDefaultInitialization:i,getDefaultOptions:a,setDefaultOptions:u})},t.ClickScrollPlugin=En,t.OverlayScrollbars=Xn,t.ScrollbarsHidingPlugin=Ln,t.SizeObserverPlugin=mn,Object.defineProperty(t,Symbol.toStringTag,{value:"Module"}),t}({});

class ProductRecommendations extends HTMLElement {
  constructor() {
    super();
    window.initLazyScript(this, this.init.bind(this), 500);
  }

  async init() {
    const { productId } = this.dataset;
    if (!productId) return;

    try {
      const response = await fetch(`${this.dataset.url}&product_id=${productId}`);
      if (!response.ok) throw new Error(response.status);

      const tmpl = document.createElement('template');
      tmpl.innerHTML = await response.text();

      const el = tmpl.content.querySelector('product-recommendations');
      if (el && el.hasChildNodes()) {
        this.innerHTML = el.innerHTML;
      }
    } catch (error) {
      console.log(error); // eslint-disable-line
    }
  }
}

customElements.define('product-recommendations', ProductRecommendations);

window.initLazyScript = initLazyScript;

document.addEventListener('keydown', (evt) => {
  if (evt.code === 'Tab') {
    document.body.classList.add('tab-used');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.body.classList.add('dom-loaded');
  }, 0);

  setTimeout(() => {
    document.body.classList.add('dom-loaded-plus-6');
  }, 6000);

  if (theme.settings.externalLinksNewTab) {
    document.addEventListener('click', (evt) => {
      const link = evt.target.tagName === 'A' ? evt.target : evt.target.closest('a');
      if (link && link.tagName === 'A' && window.location.hostname !== new URL(link.href).hostname) {
        link.target = '_blank';
      }
    });
  }

  // Ensure anchor scrolling is smooth (this shouldn't be added in the CSS)
  document.addEventListener('click', (evt) => {
    if (evt.target.tagName === 'A' && window.location.hostname === new URL(evt.target.href).hostname
      && evt.target.href.includes('#')) {
      document.getElementsByTagName('html')[0].style.scrollBehavior = 'smooth';
      setTimeout(() => {
        document.getElementsByTagName('html')[0].style.scrollBehavior = '';
      }, 1000);
    }
  });
});

// Emit an event to indicate the page was restored from bfcache, https://web.dev/articles/bfcache
window.addEventListener('pageshow', (evt) => {
  if (evt.persisted) {
    document.dispatchEvent(new CustomEvent('on:bfcache:load-restore'));
  } else {
    document.dispatchEvent(new CustomEvent('on:bfcache:load-normal'));
  }
});

// Init mobile-only scrolling where needed
if (window.OverlayScrollbarsGlobal) {
  const initMobileScrollbars = () => {
    document.querySelectorAll('.slider--mobile').forEach((slider) => {
      window.OverlayScrollbarsGlobal.OverlayScrollbars({
        target: slider.parentElement,
        elements: {
          viewport: slider
        }
      }, {});
    });
  };

  initMobileScrollbars();
  document.addEventListener('shopify:section:load', initMobileScrollbars);
}
