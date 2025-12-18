/* global debounce, trapFocus */

if (!customElements.get('cart-items')) {
  class CartItems extends HTMLElement {
    constructor() {
      super();
      if (this.dataset.empty === 'false') this.init();
    }

    init() {
      this.fetchRequestOpts = {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      };

      this.cartDrawer = document.getElementById('cart-drawer');
      this.itemStatus = document.getElementById('cart-line-item-status');
      this.currentTotalItemCount = Array.from(this.querySelectorAll('[name="updates[]"]')).reduce(
        (total, quantityInput) => total + parseInt(quantityInput.value, 10),
        0
      );

      this.currentQuantities = [];
      this.querySelectorAll('.cart-item').forEach((item) => {
        this.currentQuantities[item.dataset.variantId] = Number(item.querySelector('.qty-input__input').value);
      });

      this.addEventListener('click', this.handleClick.bind(this));
      this.addEventListener('change', debounce(this.handleChange.bind(this)));

      // 
      // Agregar event listener a 'Vaciar carrito'
      const clearAllBtn = document.querySelector('.js-vaciar-carrito');
      if (clearAllBtn) {
        clearAllBtn.addEventListener('click', (evt) => {
          evt.preventDefault();
          this.clearCart();
        });
      }

      // Add event listeners for property changes
      /* this.querySelectorAll('textarea[id^="item-properties-"]').forEach((textarea) => {
        textarea.addEventListener('blur', debounce(this.handlePropertyChange.bind(this), 300));
      }); */
    }

    /**
     * Modificado
     * Handler 'click' eventos en los cart-items.
     * @param {object} evt - Event object.
     */
    handleClick(evt) {
      if (evt.target.matches('.js-remove-item')) {
        evt.preventDefault();
        this.updateQuantity(evt.target.dataset.index, 0);
      } else if (evt.target.matches('.js-vaciar-carrito')) {
        evt.preventDefault();
        this.clearCart();
      }
    }

    /**
     * Método para Vaciar el carrito
     */
    async clearCart() {
      this.classList.add('pointer-events-none');
      
      const errors = document.getElementById('cart-errors');
      if (errors) {
        errors.innerHTML = '';
        errors.hidden = true;
      }
      
      try {
        await upng_waitForWebsocket();
        // Fetch a vaciar el carrito
        const response = await fetch('/cart/clear.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.description || errorData.message || response.statusText);
        }
        
        const clearData = await response.json();
        
        // Recargar UI
        this.refresh();
        
        // Disparar evento de carrito vaciado
        this.dispatchEvent(new CustomEvent('on:cart:clear', {
          bubbles: true,
          detail: {
            cart: clearData
          }
        }));

        // Pequeña espera para permitir que se completen las animaciones y eventos
        setTimeout(() => {
          // Recargar la página para mostrar el mensaje de carrito vacío
          window.location.reload();
        }, 100); // 100ms de espera para permitir animaciones
        
      } catch (error) {
        console.error('Error clearing cart:', error);
        
        // Display error
        if (errors) {
          errors.textContent = error.message || theme.strings.cartError;
          errors.hidden = false;
        }
        
        // Disparar error de evento
        this.dispatchEvent(new CustomEvent('on:cart:error', {
          bubbles: true,
          detail: {
            error: error.message
          }
        }));
      } finally {
        this.classList.remove('pointer-events-none');
      }
    }

    /**
     * Handles 'change' events on the cart items element.
     * @param {object} evt - Event object.
     */
    handleChange(evt) {
      if (!evt.target.dataset || !evt.target.dataset.index) return;
      this.updateQuantity(evt.target.dataset.index, evt.target.value, document.activeElement.name);
    }

    /**
     * Handles changes to the customization textarea
     * @param {object} evt - Event object
     */
    /* handlePropertyChange(evt) {
      const textareaId = evt.target.id;
      if (!textareaId) return;
      
      // Verificamos si realmente cambió el valor comparando con el valor inicial
      const currentValue = evt.target.value.trim();
      const initialValue = evt.target.dataset.initialValue || '';
      
      // Solo actualizamos si hubo un cambio en el valor
      if (currentValue !== initialValue) {
        const lineIndex = textareaId.replace('item-properties-', '');
        const lineItem = document.getElementById(`cart-item-${lineIndex}`);
        
        if (!lineItem) return;
        
        const customizeCheckbox = document.getElementById(`customize-${lineIndex}`);
        
        // Solo actualizamos si el checkbox está marcado y hay texto O si estamos borrando texto existente
        if ((customizeCheckbox && customizeCheckbox.checked && currentValue) || 
            (initialValue && currentValue === '')) {
          // Actualizamos las propiedades con el nuevo valor
          this.updateProperties(lineIndex, { customization: currentValue });
          
          // Actualizamos el valor inicial para futuras comparaciones
          evt.target.dataset.initialValue = currentValue;
        }
      }
    } */

    /**
     * Handles changes to the customization checkbox
     * @param {object} evt - Event object
     */
/*     handleCustomizeToggle(evt) {
      const checkboxId = evt.target.id;
      if (!checkboxId) return;

      const lineIndex = checkboxId.replace('customize-', '');
      const textarea = document.getElementById(`item-properties-${lineIndex}`);

      if (!textarea) return;

      if (evt.target.checked) {
        // If checked and has text, update properties
        if (textarea.value.trim()) {
          this.updateProperties(lineIndex, { customization: textarea.value.trim() });
        }
      } else {
        // If unchecked, remove the customization property
        this.updateProperties(lineIndex, { customization: '' });
      }
    } */

    /**
 * Updates the properties of a line item.
 * @param {number} line - Line item index.
 * @param {object} properties - Properties to update.
 */
    async updateProperties(line, properties) {
      const cartDrawerContent = this.cartDrawer ? this.cartDrawer.querySelector('.drawer__content') : null;
      const cartDrawerContentScroll = cartDrawerContent ? cartDrawerContent.scrollTop : 0;
      const cartDrawerScroll = this.cartDrawer ? this.cartDrawer.scrollTop : 0;

      this.enableLoading(line);

      // Clear any previous errors
      const lineErrorsId = `line-item-error-${line}`;
      const lineErrors = document.getElementById(lineErrorsId);
      if (lineErrors) {
        lineErrors.innerHTML = '';
        lineErrors.hidden = true;
      }

      const sections = this.getSectionsToRender().map((section) => section.section);

      // Get the cart item element
      const lineItem = document.getElementById(`cart-item-${line}`);
      if (!lineItem) {
        console.error(`Line item with ID "cart-item-${line}" not found`);
        return;
      }

      // Extract the actual line item ID from the remove link
      const removeLink = lineItem.querySelector('.js-remove-item');
      if (!removeLink || !removeLink.href) {
        console.error('Remove link not found or has no href');
        return;
      }

      // Parse the ID from the href (format: /cart/change?id=VARIANT_ID:HASH&quantity=0)
      const urlParams = new URLSearchParams(removeLink.href.split('?')[1]);
      const itemId = urlParams.get('id');

      if (!itemId) {
        console.error('Could not extract item ID from remove link');
        return;
      }

      // Prepare the request body for properties update
      this.fetchRequestOpts.body = JSON.stringify({
        id: itemId,
        properties,
        sections: [...new Set(sections)],
        sections_url: window.location.pathname
      });

      try {
        const variantId = Number(lineItem.dataset.variantId);

        // Send the request to update properties
        await upng_waitForWebsocket();
        const response = await fetch(theme.routes.cartChange, this.fetchRequestOpts);
        const data = await response.json();

        if (!response.ok) throw new Error(data.errors || response.status);

        // Update the sections with the new data
        this.getSectionsToRender().forEach((section) => {
          const sectionEl = document.getElementById(section.id);
          if (!sectionEl) return;

          const { selector } = section;
          const el = sectionEl.querySelector(selector) || sectionEl;
          el.innerHTML = CartItems.getElementHTML(data.sections[section.section], selector);
        });

        // Re-add event listeners since we've replaced the content
        /*setTimeout(() => {
          this.querySelectorAll('textarea[id^="item-properties-"]').forEach((textarea) => {
            // Guardamos el valor actualizado para comparaciones futuras
            textarea.dataset.initialValue = textarea.value.trim();
            textarea.addEventListener('blur', this.handlePropertyChange.bind(this));
          });
        }, 0); */

        // Dispatch an event to notify that properties have been updated
        this.dispatchEvent(new CustomEvent('on:line-item:properties-updated', {
          bubbles: true,
          detail: {
            cart: data,
            variantId,
            properties
          }
        }));

        if (lineErrors) {
          lineErrors.innerHTML = '';
          lineErrors.hidden = true;
        }

      } catch (error) {
        console.error('Error updating properties:', error);

        if (lineErrors) {
          if (typeof error === 'string') {
            lineErrors.textContent = error;
          } else if (error.message) {
            lineErrors.textContent = error.message;
          } else {
            lineErrors.textContent = theme.strings.cartError || 'Error updating properties';
          }
          lineErrors.hidden = false;
        }

        this.dispatchEvent(new CustomEvent('on:cart:error', {
          bubbles: true,
          detail: {
            error: error.message || 'Unknown error'
          }
        }));
      } finally {
        this.querySelectorAll('.cart-item__loader').forEach((loader) => {
          loader.hidden = true;
        });
        this.classList.remove('pointer-events-none');

        // Restore scroll position
        if (cartDrawerContent) {
          requestAnimationFrame(() => { cartDrawerContent.scrollTop = cartDrawerContentScroll; });
          setTimeout(() => { cartDrawerContent.scrollTop = cartDrawerContentScroll; }, 0);
          requestAnimationFrame(() => { this.cartDrawer.scrollTop = cartDrawerScroll; });
          setTimeout(() => { this.cartDrawer.scrollTop = cartDrawerScroll; }, 0);
        }
      }
    }

    /**
     * Updates the quantity of a line item.
     * @param {number} line - Line item index.
     * @param {number} quantity - Quantity to set.
     * @param {string} name - Active element name.
     */
    async updateQuantity(line, quantity, name) {
      const cartDrawerContent = this.cartDrawer ? this.cartDrawer.querySelector('.drawer__content') : null;
      const cartDrawerContentScroll = cartDrawerContent ? cartDrawerContent.scrollTop : 0;
      const cartDrawerScroll = this.cartDrawer ? this.cartDrawer.scrollTop : 0;

      this.enableLoading(line);

      // clear all errors except this line's (which will be refreshed after this update)
      const lineErrorsId = `line-item-error-${line}`;
      const lineErrors = document.getElementById(lineErrorsId);
      document.querySelectorAll(`.cart-errors, .cart-item__error:not([id="${lineErrorsId}"])`).forEach((el) => {
        el.innerHTML = '';
        el.hidden = true;
      });

      const sections = this.getSectionsToRender().map((section) => section.section);
      this.fetchRequestOpts.body = JSON.stringify({
        line,
        quantity,
        sections: [...new Set(sections)],
        sections_url: window.location.pathname
      });

      try {
        const lineItem = document.getElementById(`cart-item-${line}`);
        if (!lineItem) throw new Error(`Line item with ID "cart-item-${line}" not found`);

        const variantId = Number(lineItem.dataset.variantId);
        const oldTotalQuantity = this.currentTotalItemCount;
        await upng_waitForWebsocket();
        const response = await fetch(theme.routes.cartChange, this.fetchRequestOpts);
        const data = await response.json();

        if (!response.ok) throw new Error(data.errors || response.status);

        const newTotalQuantity = data.item_count;

        if (this.cartDrawer) {
          cartDrawerContent.classList.toggle('drawer__content--flex', newTotalQuantity === 0);

          if (newTotalQuantity === 0) {
            const recommendations = this.cartDrawer.querySelector('product-recommendations');
            if (recommendations) recommendations.remove();
          }
        } else if (newTotalQuantity === 0) {
          // We're on the Cart page
          const cartTitle = this.closest('.cc-main-cart').querySelector('.js-cart-title');
          if (cartTitle) cartTitle.style.textAlign = 'center';

          const cartSummaryCss = document.getElementById('cart-summary-css');
          if (cartSummaryCss) cartSummaryCss.remove();

          const cartSummary = document.getElementById('cart-summary');
          if (cartSummary) cartSummary.hidden = true;
        }

        this.getSectionsToRender().forEach((section) => {
          const sectionEl = document.getElementById(section.id);
          if (!sectionEl) return;

          const { selector } = section;
          const el = sectionEl.querySelector(selector) || sectionEl;
          el.innerHTML = CartItems.getElementHTML(data.sections[section.section], selector);
        });

        if (this.cartDrawer && newTotalQuantity === 0) {
          cartDrawerContent.classList.add('grow', 'flex', 'items-center');

          if (this.cartDrawer.querySelector('promoted-products')) {
            this.cartDrawer
              .querySelector('.drawer__content')
              .classList.toggle('drawer__empty-with-promotions', newTotalQuantity === 0);
          }
        }

        this.updateRecommendations(data.item_count > 0 ? data.items[0].product_id : null);
        this.updateLiveRegions();
        this.setFocus(line, newTotalQuantity, name);
        this.dataset.empty = newTotalQuantity === 0;
        this.currentTotalItemCount = newTotalQuantity;

        // Fire the on:line-item:change event if the line item quantity has changed
        if (oldTotalQuantity !== newTotalQuantity) {
          this.dispatchEvent(new CustomEvent('on:line-item:change', {
            bubbles: true,
            detail: {
              cart: data,
              variantId,
              oldQuantity: this.currentQuantities[variantId],
              newQuantity: Number(quantity)
            }
          }));
        }

        this.currentQuantities[variantId] = Number(quantity);

        if (lineErrors) {
          lineErrors.innerHTML = '';
          lineErrors.hidden = true;
        }
      } catch (error) {
        if (lineErrors) {
          if (/^[0-9]+$/.test(error.message)) {
            lineErrors.textContent = theme.strings.cartError;
          } else {
            lineErrors.textContent = error.message;
          }
          lineErrors.hidden = false;
        }
        console.log(error); // eslint-disable-line

        this.querySelectorAll('.cart-item__loader').forEach((loader) => {
          loader.hidden = true;
        });

        this.dispatchEvent(new CustomEvent('on:cart:error', {
          bubbles: true,
          detail: {
            error: error.message
          }
        }));

        const input = document.getElementById(`quantity-${line}`);
        if (input) {
          input.value = input.dataset.initialValue;
          const quantityInput = input.closest('quantity-input');
          if (quantityInput) {
            quantityInput.currentQty = input.dataset.initialValue;
          }
        }
      } finally {
        this.classList.remove('pointer-events-none');

        // Attempt to maintain the same scroll position in the cart drawer
        if (cartDrawerContent) {
          requestAnimationFrame(() => { cartDrawerContent.scrollTop = cartDrawerContentScroll; });
          setTimeout(() => { cartDrawerContent.scrollTop = cartDrawerContentScroll; }, 0);
          requestAnimationFrame(() => { this.cartDrawer.scrollTop = cartDrawerScroll; });
          setTimeout(() => { this.cartDrawer.scrollTop = cartDrawerScroll; }, 0);
        }
      }
    }

    /**
     * Refreshes the cart by rerendering its sections and updating its product recommendations.
     */
    async refresh() {
      const errors = document.getElementById('cart-errors');
      try {
        const sections = this.getSectionsToRender().map((section) => section.section);
        const response = await fetch(`?sections=${[...new Set(sections)]}`);

        // The status is 400, refresh the whole cart and stop
        if (response.status === 400 && this.cartDrawer) {
          this.cartDrawer.refresh(true);
          return;
        }

        const data = await response.json();

        if (!response.ok) throw new Error(response.status);

        this.getSectionsToRender().forEach((section) => {
          const sectionEl = document.getElementById(section.id);
          if (!sectionEl) return;

          const el = sectionEl.querySelector(section.selector) || sectionEl;
          el.innerHTML = CartItems.getElementHTML(data[section.section], section.selector);
        });

        const firstCartItem = this.querySelector('.cart-item:first-child');
        this.updateRecommendations(firstCartItem ? firstCartItem.dataset.productId : null);

        errors.innerHTML = '';
        errors.hidden = true;
      } catch (error) {
        errors.textContent = theme.strings.cartError;
        errors.hidden = false;
        console.log(error); // eslint-disable-line

        this.dispatchEvent(new CustomEvent('on:cart:error', {
          bubbles: true,
          detail: {
            error: error.message
          }
        }));
      }
    }

    /**
     * Returns an array of objects containing required section details.
     * @returns {Array}
     */
    getSectionsToRender() {
      let sections = [
        {
          id: 'cart-icon-bubble',
          section: 'cart-icon-bubble',
          selector: '.shopify-section'
        },
        {
          id: 'free-shipping-notice',
          section: 'free-shipping-notice',
          selector: '.free-shipping-notice'
        }
      ];

      if (this.cartDrawer) {
        const cartDrawerId = this.cartDrawer.closest('.shopify-section').id.replace('shopify-section-', '');
        sections = [
          ...sections,
          {
            id: 'cart-items',
            section: cartDrawerId,
            selector: 'cart-items'
          },
          {
            id: 'cart-promoted-products',
            section: cartDrawerId,
            selector: '#cart-promoted-products'
          },
          {
            id: 'cart-drawer',
            section: cartDrawerId,
            selector: '.cart-drawer__summary'
          },
          {
            id: 'cart-drawer-media-promotion',
            section: cartDrawerId,
            selector: '#cart-drawer-media-promotion'
          }
        ];
      } else {
        sections = [
          ...sections,
          {
            id: 'cart-items',
            section: this.dataset.section,
            selector: 'cart-items'
          },
          {
            id: 'cart-summary',
            section: document.getElementById('cart-summary').dataset.section,
            selector: '.cart__summary'
          }
        ];
      }

      return sections;
    }

    /**
     * Gets the innerHTML of an element.
     * @param {string} html - Section HTML.
     * @param {string} selector - CSS selector for the element to get the innerHTML of.
     * @returns {string}
     */
    static getElementHTML(html, selector) {
      const tmpl = document.createElement('template');
      tmpl.innerHTML = html;

      const el = tmpl.content.querySelector(selector);
      return el ? el.innerHTML : '';
    }

    /**
     * Shows a loading icon over a line item.
     * @param {string} line - Line item index.
     */
    enableLoading(line) {
      this.classList.add('pointer-events-none');

      const loader = this.querySelector(`#cart-item-${line} .cart-item__loader`);
      if (loader) loader.hidden = false;

      document.activeElement.blur();
      if (this.itemStatus) this.itemStatus.setAttribute('aria-hidden', 'false');
    }

    /**
     * Updates the cart recommendations.
     * @param {string} productId - The product id for which to find recommendations.
     */
    updateRecommendations(productId) {
      this.recommendations = this.recommendations || document.getElementById('cart-recommendations');
      if (!this.recommendations) return;

      if (productId) {
        this.recommendations.dataset.productId = productId;
        this.recommendations.init();
      } else {
        this.recommendations.innerHTML = '';
      }
    }

    /**
     * Updates the live regions.
     */
    updateLiveRegions() {
      this.itemStatus.setAttribute('aria-hidden', 'true');

      const cartStatus = document.getElementById('cart-live-region-text');
      cartStatus.setAttribute('aria-hidden', 'false');

      setTimeout(() => {
        cartStatus.setAttribute('aria-hidden', 'true');
      }, 1000);
    }

    /**
     * Traps focus in the relevant container or focuses the active element.
     * @param {number} line - Line item index.
     * @param {number} itemCount - Item count.
     * @param {string} name - Active element name.
     */
    setFocus(line, itemCount, name) {
      const lineItem = document.getElementById(`cart-item-${line}`);
      let activeEl;

      if (lineItem) {
        activeEl = lineItem.querySelector(`[name="${name}"]`);
      }

      if (this.cartDrawer) {
        if (lineItem && activeEl) {
          trapFocus(this.cartDrawer, activeEl);
        } else if (itemCount === 0) {
          trapFocus(
            this.cartDrawer.querySelector('.js-cart-empty'),
            this.cartDrawer.querySelector('a')
          );
        } else if (this.cartDrawer.querySelector('.cart-item')) {
          trapFocus(this.cartDrawer, document.querySelector('.js-item-name'));
        }
      } else if (lineItem && activeEl) {
        activeEl.focus();
      }
    }
  }
/* 
  function fetchShopifyCart() {
    fetch('/cart.js')
      .then(response => {
        if (!response.ok) {
          throw new Error('Error al obtener el carrito: ' + response.status);
        }
        return response.json();
      })
      .then(data => {
        data.items.forEach( item => {
          console.log('Perzonalizacion:', item.properties.customization);
        });
        return data; // Por si necesitas usar los datos en otra parte
      })
      .catch(error => {
        console.error('Error en la petición:', error);
      });
  }

  // Llamar a la función para ejecutarla
  fetchShopifyCart(); */

  customElements.define('cart-items', CartItems);
}
