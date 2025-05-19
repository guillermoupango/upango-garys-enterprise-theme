/* eslint-disable */

/**
 * Dependencies:
 * - Custom select component
 *
 * Required translation strings:
 * - addToCart
 * - noStock
 * - noVariant
 * - onlyXLeft
 */

if (!customElements.get('upng-variant-picker')) {
  // COSNTRUCTOR ACTUALIZADO PARA INCLUIR NUEVAS FUNCIONALIDADES
  class VariantPicker extends HTMLElement {
    constructor() {
      super();

      // Estado interno para funcionalidades.
      // El contexto es quick-add-drawer hasta que se indique lo contrario
      this._state = {
        isTableLoaded: false,
        isCartSynced: false,
        isUpdating: false,
        isQuickAddContext: this.dataset.context === 'quick-add-drawer'
      };

      // Bind de métodos de clase
      this.boundHandleCartAdd = this.handleCartAdd.bind(this);
      this.boundHandleLineItemChange = this.handleLineItemChange.bind(this);
      this.boundDebouncedQuantityChange = this.debouncedQuantityChange.bind(this);

      // Mantener todas las inicializaciones originales del tema
      this.section = this.closest('.js-product');
      this.productForm = this.section.querySelector('.js-product-form-main');
      this.optionSelectors = this.querySelectorAll('.option-selector');
      this.data = this.getProductData();
      this.variant = this.getSelectedVariant();
      this.selectedOptions = this.getSelectedOptions();
      this.preSelection = !this.variant && this.selectedOptions.find((o) => o === null) === null;

      // Event listener original del tema
      this.addEventListener('change', this.handleVariantChange.bind(this));

      // Bind de eventos de INPUT Quantity
      this.boundHandleQuantityButtonClick = this.handleQuantityButtonClick.bind(this);
      this.boundHandleInputFocus = this.handleInputFocus.bind(this);
      this.boundHandleInputKeydown = this.handleInputKeydown.bind(this);
      this.boundHandleRemoveButtonClick = this.handleRemoveButtonClick.bind(this);

      // Mantener el setTimeout original del tema
      setTimeout(() => {
        this.updateAvailability();
        this.updateAddToCartButton();
        this.updateTratamientos(); // Fetch de tratamientos
      });

      // Inicializar nuestras nuevas funcionalidades después del timeout del tema
      setTimeout(() => {
        this.initTableAndSync();
      }, 100); // Dar tiempo extra después de la inicialización del tema
    }

    /**
     * Handles 'change' events on the variant picker element.
     * @param {object} evt - Event object.
     */

    // Sobrescribir handleVariantChange para incluir actualización de tabla
    handleVariantChange(evt) {
      // Primero verificamos si el evento viene de un input de cantidad
      if (evt.target.classList.contains('variant-table__quantity')) {
        // Si viene de un input de cantidad, no procesamos como cambio de variante
        return;
      }

      this.selectedOptions = this.getSelectedOptions();
      this.variant = this.getSelectedVariant();
      this.preSelection = !this.variant && this.selectedOptions.find((o) => o === null) === null;

      if (this.variant) {
        this.updateMedia();
        this.updateUrl(evt);
        this.updateVariantInput();
      }
      this.updateAddToCartButton();
      this.updateAvailability();
      this.updatePrice();
      this.updateWeight();
      this.updateBarcode();
      this.updateBackorderText();
      this.updatePickupAvailability();
      this.updateSku();
      this.updateMetafieldVisibility();
      this.updateTratamientos(); // Actualizar de tratamientos
      // Solo llamamos a updateLabelText si el evento proviene de un selector de opciones
      if (evt.target.closest('.option-selector')) {
        VariantPicker.updateLabelText(evt);
      }
      // Añadir nuestra actualización de tabla si está cargada y si NO estamos en contexto compact
      if (this._state.isTableLoaded && !this._state.isQuickAddContext) {
        this.updateTableVisibility();
      }
      if (!this.preSelection) {
        this.dispatchEvent(new CustomEvent('on:variant:change', {
          bubbles: true,
          detail: {
            form: this.productForm,
            variant: this.variant,
            product: this.data.product
          }
        }));
      }
    }

    /**
     * Ajax para actualizar iconos de tratamientos
     */

      async updateTratamientos() {
      if (!this.variant) return;
      
      const treatmentContainer = this.section.querySelector('.tratamiento-icons-container');
      if (!treatmentContainer) return;
      
      try {
        // Hacer petición AJAX para obtener los tratamientos
        const response = await fetch(`${window.location.pathname}?variant=${this.variant.id}&view=upng-tratamientos`);
        if (!response.ok) throw new Error('Error loading treatment data');
        
        const html = await response.text();
        
        // Actualizar el contenedor con el HTML recibido
        treatmentContainer.innerHTML = html;
      } catch (error) {
        console.error('Error updating treatment icons:', error);
      }
    }

    /**
     * Shows/hides variant metafield elements on the page as necessary
     */
    updateMetafieldVisibility() {
      document.querySelectorAll('[data-variant-metafield]').forEach((elem) => {
        elem.classList.toggle('hidden', elem.dataset.variantMetafield !== this.variant?.id.toString());
      });
    }

    /**
     * Updates the "Add to Cart" button label and disabled state.
     */
    updateAddToCartButton() {
      this.productForm = this.section.querySelector('.js-product-form-main');
      if (!this.productForm) return;

/*    //DEJAR COMENTADO PORQUE NO SE USA 'ADD TO CART' DE TEMA

      this.addBtn = this.addBtn || this.productForm.querySelector('[name="add"]');
      const variantAvailable = this.variant && this.variant.available;

      this.addBtn.disabled = !variantAvailable || this.preSelection;

      if (this.preSelection) {
        this.addBtn.textContent = theme.strings.noSelectedVariant;
      } else {

        const unavailableStr = this.variant ? theme.strings.noStock : theme.strings.noVariant;
        this.addBtn.textContent = variantAvailable
          ? this.addBtn.dataset.addToCartText
          : unavailableStr;
      } */
    }

    /**
     * Updates the availability status of an option.
     * @param {Element} optionEl - Option element.
     * @param {boolean} exists - Does this option lead to a variant that exists?
     * @param {boolean} available - Does this option lead to a variant that is available to buy?
     */
    static updateOptionAvailability(optionEl, exists, available) {
      const el = optionEl;
      const unavailableText = exists ? theme.strings.noStock : theme.strings.noVariant;
      el.classList.toggle('is-unavailable', !available);
      el.classList.toggle('is-nonexistent', !exists);

      if (optionEl.classList.contains('custom-select__option')) {
        const em = el.querySelector('em');

        if (em) {
          em.hidden = available;
        }

        if (!available) {
          if (em) {
            em.textContent = unavailableText;
          } else {
            el.innerHTML = `${el.innerHTML} <em class="pointer-events-none">${unavailableText}</em>`;
          }
        }
      } else if (!available) {
        el.nextElementSibling.title = unavailableText;
      } else {
        el.nextElementSibling.removeAttribute('title');
      }
    }

    /**
     * Updates the availability status in option selectors.
     */
    updateAvailability() {
      if (this.dataset.showAvailability === 'false') return;
      const { availabilityMethod } = this.dataset; // 'downward' or 'selection'
      let currVariant = this.variant;

      if (!this.variant) {
        currVariant = { options: this.selectedOptions };
      }

      if (availabilityMethod === 'selection') {
        // Flag all options as unavailable
        this.querySelectorAll('.js-option').forEach((optionEl) => {
          VariantPicker.updateOptionAvailability(optionEl, false, false);
        });

        // Flag selector options as available or sold out, depending on the variant availability
        this.optionSelectors.forEach((selector, selectorIndex) => {
          this.data.product.variants.forEach((variant) => {
            let matchCount = 0;

            variant.options.forEach((option, optionIndex) => {
              if (option === currVariant.options[optionIndex] && optionIndex !== selectorIndex) {
                matchCount += 1;
              }
            });

            if (matchCount === currVariant.options.length - 1) {
              const options = selector.querySelectorAll('.js-option');
              const optionEl = Array.from(options).find((opt) => {
                if (selector.dataset.selectorType === 'dropdown') {
                  return opt.dataset.value === variant.options[selectorIndex];
                }
                return opt.value === variant.options[selectorIndex];
              });

              if (optionEl) {
                VariantPicker.updateOptionAvailability(optionEl, true, variant.available);
              }
            }
          });
        });
      } else {
        this.optionSelectors.forEach((selector, selectorIndex) => {
          const options = selector.querySelectorAll('.js-option:not([data-value=""])');
          options.forEach((option) => {
            const optionValue = selector.dataset.selectorType === 'dropdown' ? option.dataset.value : option.value;
            // any available variants with previous options and this one locked in?
            let variantsExist = false;
            let variantsAvailable = false;
            this.data.product.variants.forEach((v) => {
              let matches = 0;
              for (let i = 0; i < selectorIndex; i += 1) {
                if (v.options[i] === this.selectedOptions[i] || this.selectedOptions[i] === null) {
                  matches += 1;
                }
              }
              if (v.options[selectorIndex] === optionValue && matches === selectorIndex) {
                variantsExist = true;
                if (v.available) {
                  variantsAvailable = true;
                }
              }
            });
            VariantPicker.updateOptionAvailability(option, variantsExist, variantsAvailable);
          });
        });
      }
    }

    /**
     * Updates the backorder text and visibility.
     */
    updateBackorderText() {
      this.backorder = this.backorder || this.section.querySelector('.backorder');
      if (!this.backorder) return;

      let hideBackorder = true;

      if (this.variant && this.variant.available) {
        const { inventory } = this.data.formatted[this.variant.id];

        if (this.variant.inventory_management && inventory === 'none') {
          const backorderProdEl = this.backorder.querySelector('.backorder__product');
          const prodTitleEl = this.section.querySelector('.product-title');
          const variantTitle = this.variant.title.includes('Default')
            ? ''
            : ` - ${this.variant.title}`;

          backorderProdEl.textContent = `${prodTitleEl.textContent}${variantTitle}`;
          hideBackorder = false;
        }
      }

      this.backorder.hidden = hideBackorder;
    }

    /**
     * Updates the color option label text.
     * @param {object} evt - Event object
     */
    static updateLabelText(evt) {
      const selector = evt.target.closest('.option-selector');
      if (selector.dataset.selectorType === 'dropdown') return;

      const colorText = selector.querySelector('.js-color-text');
      if (!colorText) return;

      colorText.textContent = evt.target.nextElementSibling.querySelector('.js-value').textContent;
    }

    /**
     * Updates the product media.
     */
    updateMedia() {
      if (!this.variant.featured_media) return;

      if (this.section.matches('quick-add-drawer')) {
        this.section.updateMedia(this.variant.featured_media.id);
      } else {
        this.mediaGallery = this.mediaGallery || this.section.querySelector('media-gallery');
        if (!this.mediaGallery) return;

        const variantMedia = this.mediaGallery.querySelector(
          `[data-media-id="${this.variant.featured_media.id}"]`
        );
        this.mediaGallery.setActiveMedia(variantMedia, true, true);
      }
    }

    /**
     * Updates the pick up availability.
     */
    updatePickupAvailability() {
      this.pickUpAvailability =
        this.pickUpAvailability || this.section.querySelector('pickup-availability');
      if (!this.pickUpAvailability) return;

      if (this.variant && this.variant.available) {
        this.pickUpAvailability.getAvailability(this.variant.id);
      } else {
        this.pickUpAvailability.removeAttribute('available');
        this.pickUpAvailability.innerHTML = '';
      }
    }

    /**
     * Updates the price.
     */
    updatePrice() {
      this.price = this.price || this.section.querySelector('.product-info__price > .price');
      if (!this.price) return;

      let { variant } = this;
      if (this.preSelection) {
        variant = this.data.product.variants[0];
        for (let i = 1; i < this.data.product.variants.length; i += 1) {
          if (this.data.product.variants[i].price < variant.price) variant = this.data.product.variants[i];
        }
      }

      if (this.variant) {
        const priceCurrentEl = this.price.querySelector('.price__current');
        const priceWasEl = this.price.querySelector('.price__was');
        const unitPriceEl = this.price.querySelector('.unit-price');

        // Update current price and original price if on sale.
        priceCurrentEl.innerHTML = this.data.formatted[this.variant.id].price;
        if (priceWasEl)
          priceWasEl.innerHTML = this.data.formatted[this.variant.id].compareAtPrice || '';

        // Update unit price, if specified.
        if (this.variant.unit_price_measurement) {
          const valueEl = this.price.querySelector('.unit-price__price');
          const unitEl = this.price.querySelector('.unit-price__unit');
          const value = this.variant.unit_price_measurement.reference_value;
          const unit = this.variant.unit_price_measurement.reference_unit;

          valueEl.innerHTML = this.data.formatted[this.variant.id].unitPrice;
          unitEl.textContent = value === 1 ? unit : `${value} ${unit}`;
        }

        unitPriceEl.hidden = !this.variant.unit_price_measurement;
        this.price.classList.toggle(
          'price--on-sale',
          this.variant.compare_at_price > this.variant.price
        );
        this.price.classList.toggle('price--sold-out', !this.variant.available && !this.preSelection);
      }

      this.price.querySelector('.price__default').hidden = !this.variant && !this.preSelection;
      this.price.querySelector('.price__no-variant').hidden = this.variant || this.preSelection;
      const from = this.price.querySelector('.price__from');
      if (from) {
        from.hidden = !this.preSelection;
      }
    }

    /**
     * Updates the weight.
     */
    updateWeight() {
      this.weights = this.weights || this.section.querySelectorAll('.product-info__weight');
      if (this.weights.length === 0) return;

      const weightAvailable = this.variant && this.variant.weight > 0;
      this.weights.forEach((weight) => {
        weight.textContent = weightAvailable ? this.data.formatted[this.variant.id].weight : '';
        weight.hidden = !weightAvailable;
      });
    }

    /**
     * Updates the Barcode.
     */
    updateBarcode() {
      this.barcodes = this.barcodes || this.section.querySelectorAll('.product-info__barcode-value');
      if (this.barcodes.length === 0) return;

      const barcodeAvailable = this.variant && this.variant.barcode;
      this.barcodes.forEach((barcode) => {
        barcode.textContent = barcodeAvailable ? this.variant.barcode : '';
        barcode.parentNode.hidden = !barcodeAvailable;
      });
    }

    /**
     * Updates the SKU.
     */
    updateSku() {
      this.sku = this.sku || this.section.querySelector('.product-sku__value');
      if (!this.sku) return;

      const skuAvailable = this.variant && this.variant.sku;
      this.sku.textContent = skuAvailable ? this.variant.sku : '';
      this.sku.parentNode.hidden = !skuAvailable;
    }

    /**
     * Updates the url with the selected variant id.
     * @param {object} evt - Event object.
     */
    updateUrl(evt) {
      if (!evt || evt.type !== 'change' || this.dataset.updateUrl === 'false') return;
      window.history.replaceState({}, '', `${this.dataset.url}?variant=${this.variant.id}`);
    }

    /**
     * Updates the value of the hidden [name="id"] form inputs.
     */
    updateVariantInput() {
      this.forms =
        this.forms || this.section.querySelectorAll('.js-product-form-main, .js-instalments-form');

      this.forms.forEach((form) => {
        const input = form.querySelector('input[name="id"]');
        input.value = this.variant.id;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    /**
     * Gets the selected option element from each selector.
     * @returns {Array}
     */
    getSelectedOptions() {
      const selectedOptions = [];

      this.optionSelectors.forEach((selector) => {
        if (selector.dataset.selectorType === 'dropdown') {
          const selectedText = selector.querySelector('.custom-select__btn').textContent.trim();
          selectedOptions.push(selectedText === this.dataset.placeholderText ? null : selectedText);
        } else {
          const selected = selector.querySelector('input:checked');
          selectedOptions.push(selected ? selected.value : null);
        }
      });

      return selectedOptions;
    }

    /**
     * Gets the product data.
     * @returns {?object}
     */
    getProductData() {
      const dataEl = this.querySelector('[type="application/json"]');
      return JSON.parse(dataEl.textContent);
    }

    /**
     * Get selected variant data.
     * @returns {?object} Variant object, or null if one is not selected.
     */
    getSelectedVariant() {
      const selectedOptions = this.getSelectedOptions();
      return this.data.product.variants.find(
        (v) => v.options.every((val, index) => val === selectedOptions[index])
      );
    }

    /**
     ****** UPANGO ******
     * Ampliar logica para sincronizar el carrito
    */

    // Nuevo método para manejar nuestra inicialización
    async initTableAndSync() {
      try {
        // Primero cargar la tabla
        await this.loadVariantTable();
        this._state.isTableLoaded = true;

        // Luego inicializar sincronización del carrito
        await this.initCartSync();
        this._state.isCartSynced = true;
      } catch (error) {
        console.error('Error during table and cart sync initialization:', error);
      }
    }

    async loadVariantTable() {
      if (this._state.isTableLoaded) return;

      try {
        const productUrl = this.dataset.url;
    
        // Usar data-context si está disponible
        const isQuickAddContext = this._state.isQuickAddContext;
        
        // Seleccionar la plantilla adecuada según el contexto
        const viewTemplate = isQuickAddContext ? 'upng-variant-table-compact' : 'upng-variant-table';
        const tableViewUrl = `${productUrl}?view=${viewTemplate}`;

        const response = await fetch(tableViewUrl);
        if (!response.ok) throw new Error('Failed to load variant table');

        const html = await response.text();

        // Crear contenedor 
        const tableContainer = document.createElement('div');
        tableContainer.className = 'variant-table-container mt-4';
        tableContainer.innerHTML = html;

        this.appendChild(tableContainer);

        // Guardar referencias 
        this.tableContainer = tableContainer;
        this.variantTable = tableContainer.querySelector('.variant-table');
        this.variantRows = this.querySelectorAll('.variant-table__row');
        this.quantityInputs = this.querySelectorAll('.variant-table__quantity');
        this.qtyButtons = this.querySelectorAll('.qty-input__btn');
        this.removeContainers = this.querySelectorAll('.variant-table__remove-container');
        this.removeButtons = this.querySelectorAll('.js-remove-item');
        this.subtotalValueEl = tableContainer.querySelector('.variant-table__subtotal-value');
        this.totalItemsValueEl = tableContainer.querySelector('.variant-table__total-items-value');
        this.clearAllButton = tableContainer.querySelector('.variant-table__clear-button');
        this.viewCartButton = tableContainer.querySelector('.variant-table__view-cart-button');
        this.totalsLoader = tableContainer.querySelector('.variant-table__loader');
        this.prices = tableContainer.querySelectorAll('.upng-price-wrapper--pvd');

        //console.log(this.prices);
        

        // Inicializar eventos para los botones de eliminar Linea
        if (this.removeButtons && this.removeButtons.length > 0) {
          this.removeButtons.forEach(button => {
            button.addEventListener('click', this.boundHandleRemoveButtonClick);
          });
        }

        // Inicializar eventos para los botones en Totales
        if (this.clearAllButton) {
          this.clearAllButton.addEventListener('click', this.handleClearAll.bind(this));
        }

        if (this.viewCartButton) {
          this.viewCartButton.addEventListener('click', this.handleViewCart.bind(this));
        }

        // Marcar como cargada
        this._state.isTableLoaded = true;

        // Solo aplicar filtrado si NO estamos en contexto compact
        if (!this._state.isQuickAddContext) {
          this.filterTableBySelectedVariant();
        }

      } catch (error) {
        console.error('Error loading variant table:', error);
        throw error;
      }

      finally {

        const isPvdVisible = localStorage.getItem('pvdVisible') !== 'false';

        console.log(isPvdVisible);

        if (isPvdVisible) {
          this.prices.forEach(el => {
            el.style.display = 'block';
          });
        }
        
      }
    }

    // Nuevo método para filtrar tabla
    filterTableBySelectedVariant() {

      // No hacer nada si la tabla no está cargada o estamos en vista compacta
      if (!this._state.isTableLoaded || this._state.isQuickAddContext) return;
      if (!this.variantRows || !this.variantRows.length) return;

      // Usar la variante actualmente seleccionada (ya sea por URL o por defecto)
      let selectedColor;
      // Si hay una variante seleccionada (esto incluye variantes de URL gracias a getSelectedVariant)
      if (this.variant) {
        selectedColor = this.variant.option1;
      }
      // Si no hay variante seleccionada, usar la primera variante
      else if (this.data.product.variants.length > 0) {
        selectedColor = this.data.product.variants[0].option1;
      }
      else {
        return; // No hay variantes para filtrar
      }

      // Asegurarnos de que selectedColor es string y aplicar trim
      selectedColor = String(selectedColor).trim();

      // Filtrar filas
      this.variantRows.forEach(row => {
        const rowColor = row.querySelector('td:nth-child(2)').textContent.trim();
        const shouldShow = rowColor === selectedColor;
        row.style.display = shouldShow ? '' : 'none';
      });
    }

    async initCartSync() {
      // Validar que la tabla esté cargada y que no esté ya sincronizado
      if (!this._state.isTableLoaded || this._state.isCartSynced) return;

      try {
        // Primero cargar el estado inicial del carrito
        await this.updateFromCart();

        // Inicializar event listeners del carrito
        document.addEventListener('on:cart:add', this.boundHandleCartAdd);
        document.addEventListener('on:line-item:change', this.boundHandleLineItemChange);

        // Inicializar event listeners de los inputs
        if (this.quantityInputs && this.quantityInputs.length > 0) {
          this.quantityInputs.forEach(input => {
            // Verificar que el input tenga un data-variant-id válido antes de agregar el listener
            if (input.hasAttribute('data-variant-id')) {
              input.addEventListener('change', this.boundDebouncedQuantityChange);
            }
            // Evento focus
            input.addEventListener('focus', this.boundHandleInputFocus);

            // Evento keydown
            input.addEventListener('keydown', this.boundHandleInputKeydown);
          });
        }

        // Agrega listeners para los botones de cantidad
        if (this.qtyButtons && this.qtyButtons.length > 0) {
          this.qtyButtons.forEach(button => {
            button.addEventListener('click', this.boundHandleQuantityButtonClick);
          });
        }

        // Sólo marcar como sincronizado si todo se inicializó correctamente
        this._state.isCartSynced = true;

      } catch (error) {
        console.error('Error initializing cart sync:', error);
        // En caso de error, asegurarse de limpiar cualquier listener que se haya agregado
        this.cleanupCartListeners();
      }
    }
    // Método auxiliar para limpiar listeners (reutilizable en disconnectedCallback)
    cleanupCartListeners() {
      document.removeEventListener('on:cart:add', this.boundHandleCartAdd);
      document.removeEventListener('on:line-item:change', this.boundHandleLineItemChange);

      if (this.quantityInputs) {
        this.quantityInputs.forEach(input => {
          input.removeEventListener('change', this.boundDebouncedQuantityChange);
          input.removeEventListener('focus', this.boundHandleInputFocus);
          input.removeEventListener('keydown', this.boundHandleInputKeydown);
        });
      }
      if (this.qtyButtons) {
        this.qtyButtons.forEach(button => {
          button.removeEventListener('click', this.boundHandleQuantityButtonClick);
        });
      }
    }

    // Implementación de debounce como método de clase
    debouncedQuantityChange = (() => {
      let timeout;
      return (event) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => this.handleQuantityChange(event), 300);
      };
    })();

    async handleQuantityChange(event) {
      if (this._state.isUpdating) return;

      this.enableLoader();

      const input = event.target;
      const variantId = input.getAttribute('data-variant-id');
      const newQuantity = parseInt(input.value);

      // Validamos que tengamos un variantId válido
      if (!variantId) {
        console.error('Error: No variant ID found on input');
        return;
      }
      // Si la cantidad es 0, simplemente eliminamos del carrito
      if (newQuantity === 0) {
        await this.updateCartItem(variantId, 0);
        return;
      }

      try {
        this._state.isUpdating = true;

        // Verificamos si el producto ya existe en el carrito
        const cartResponse = await fetch('/cart.js');
        const cart = await cartResponse.json();

        const existingItem = cart.items.find(item => item.variant_id === parseInt(variantId));

        let response;

        // Si el producto ya existe en el carrito, actualizamos su cantidad
        if (existingItem) {
          response = await fetch('/cart/change.js', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: variantId,
              quantity: newQuantity
            })
          });
        }
        // Si el producto no existe en el carrito, lo agregamos
        else {
          response = await fetch('/cart/add.js', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: variantId,
              quantity: newQuantity
            })
          });
        }

        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const updatedCart = await fetch('/cart.js').then(res => res.json());

        // Verificamos que cart.items exista antes de usarlo
        if (updatedCart && updatedCart.items) {
          this.updateQuantityInputs(updatedCart.items);

          // Refrescar drawer del carrito usando el sistema de eventos del tema
          document.dispatchEvent(new CustomEvent('dispatch:cart-drawer:refresh', {
            bubbles: true
          }));

          // Actualizar el ícono del carrito en Header
          await this.updateCartIconBubble();

          // Disparar evento de adición al carrito según la documentación
          if (!existingItem) {
            document.dispatchEvent(new CustomEvent('on:cart:add', {
              detail: {
                cart: updatedCart,
                variantId: parseInt(variantId)
              },
              bubbles: true
            }));
          } else {
            document.dispatchEvent(new CustomEvent('on:line-item:change', {
              detail: {
                cart: updatedCart,
                variantId: parseInt(variantId),
                newQuantity: newQuantity,
                oldQuantity: existingItem.quantity
              },
              bubbles: true
            }));
          }
        } else {
          throw new Error('Invalid cart response');
        }

      } catch (error) {
        console.error('Error updating cart:', error);

        // Disparar evento de error del carrito según la documentación
        document.dispatchEvent(new CustomEvent('on:cart:error', {
          detail: {
            error: error.message
          },
          bubbles: true
        }));

        // Recuperar estado inicial
        this.updateFromCart();
      } finally {
        this._state.isUpdating = false;
        // Ocultar loaders y restaurar interactividad
        this.disableAllLoaders();
      }
    }

    // Método auxiliar para actualizar un elemento del carrito
    async updateCartItem(variantId, quantity) {
      try {
        this._state.isUpdating = true;

        const response = await fetch('/cart/change.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: variantId,
            quantity: quantity
          })
        });

        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const cart = await response.json();

        if (cart && cart.items) {
          this.updateQuantityInputs(cart.items);

          // Refrescar drawer del carrito
          document.dispatchEvent(new CustomEvent('dispatch:cart-drawer:refresh', {
            bubbles: true
          }));

          // Actualizar el ícono del carrito en Header
          await this.updateCartIconBubble();
        }
      } catch (error) {
        console.error('Error updating cart:', error);
        document.dispatchEvent(new CustomEvent('on:cart:error', {
          detail: { error: error.message },
          bubbles: true
        }));
      } finally {
        this._state.isUpdating = false;
        // Ocultar loaders y restaurar interactividad
        this.disableAllLoaders();
      }
    }

    updateTableVisibility() {
      if (!this._state.isTableLoaded || !this.variantRows || !this.variantRows.length) return;

      // Determinar qué color mostrar
      let selectedColor;

      // Si hay una variante seleccionada, usar su color
      if (this.variant) {
        selectedColor = this.variant.option1;
      }
      // Si no hay variante seleccionada aún, usar el color de la primera variante
      else {
        // Obtener el color de la primera variante del producto
        selectedColor = this.data.product.variants[0].option1;
      }
      // Filtrar las filas basado en el color seleccionado
      this.variantRows.forEach(row => {
        // El color está en la segunda celda (índice 1)
        const rowColor = row.querySelector('td:nth-child(2)').textContent.trim();
        // Mostrar solo filas que coincidan con el color seleccionado
        row.style.display = (rowColor === selectedColor) ? '' : 'none';
      });

      this.filterTableBySelectedVariant();

      // Actualizar totales cuando cambia la variante seleccionada
      if (this._state.isCartSynced) {
        this.updateFromCart();
      }
    }

    handleCartAdd(event) {
      const { cart } = event.detail;
      this.updateQuantityInputs(cart.items);
    }

    handleLineItemChange(event) {
      const { cart } = event.detail;
      this.updateQuantityInputs(cart.items);
    }

    updateQuantityInputs(cartItems) {
      if (!this.quantityInputs) return;
      this.quantityInputs.forEach(input => {
        const variantId = input.getAttribute('data-variant-id');
        const cartItem = cartItems.find(item => item.variant_id === parseInt(variantId));
        input.value = cartItem ? cartItem.quantity : 0;
      });

      // Actualizar visibilidad de botones de eliminar
      this.updateRemoveButtonsVisibility(cartItems);

      // Actualizar los totales de la tabla
      this.updateTableTotals(cartItems);
    }

    async updateFromCart() {
      try {
        const response = await fetch('/cart.js');

        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const cart = await response.json();

        if (cart && cart.items) {
          this.updateQuantityInputs(cart.items);
        } else {
          console.warn('Cart response does not contain items array');
        }
      } catch (error) {
        console.error('Error fetching cart:', error);
      }
    }

    disconnectedCallback() {
      // Mantener los listeners existentes
      document.removeEventListener('on:cart:add', this.boundHandleCartAdd);
      document.removeEventListener('on:line-item:change', this.boundHandleLineItemChange);

      if (this.quantityInputs) {
        this.quantityInputs.forEach(input => {
          input.removeEventListener('change', this.boundDebouncedQuantityChange);
          input.removeEventListener('focus', this.boundHandleInputFocus);
          input.removeEventListener('keydown', this.boundHandleInputKeydown);
        });
      }

      if (this.qtyButtons) {
        this.qtyButtons.forEach(button => {
          button.removeEventListener('click', this.boundHandleQuantityButtonClick);
        });
      }

      if (this.removeButtons) {
        this.removeButtons.forEach(button => {
          button.removeEventListener('click', this.boundHandleRemoveButtonClick);
        });
      }

      if (this.clearAllButton) {
        this.clearAllButton.removeEventListener('click', this.handleClearAll);
      }

      if (this.viewCartButton) {
        this.viewCartButton.removeEventListener('click', this.handleViewCart);
      }
    }

    /**
   * Maneja los clics en los botones de incremento/decremento de cantidad
   * @param {Event} event - Evento de clic
   */
    handleQuantityButtonClick(event) {
      if (!event.target.matches('.qty-input__btn')) return;
      event.preventDefault();

      // Encontrar el input asociado al botón
      const qtyContainer = event.target.closest('.qty-input');
      const input = qtyContainer.querySelector('.variant-table__quantity');
      const currentQty = input.value;

      // Incrementar o decrementar según el botón
      if (event.target.name === 'plus') {
        input.stepUp();
      } else {
        input.stepDown();
      }

      // Solo disparar el evento change si la cantidad cambió
      if (input.value !== currentQty) {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    /**
     * Selecciona todo el texto cuando el input recibe el foco
     * @param {Event} event - Evento de focus
     */
    handleInputFocus(event) {
      if (window.matchMedia('(pointer: fine)').matches) {
        event.target.select();
      }
    }

    /**
     * Maneja las pulsaciones de tecla en el input
     * @param {Event} event - Evento de keydown
     */
    handleInputKeydown(event) {
      if (event.key !== 'Enter') return;
      event.preventDefault();

      // Simular un ciclo de blur/focus para aplicar el cambio
      event.target.blur();
      event.target.focus();
    }

    updateRemoveButtonsVisibility(cartItems) {
      if (!this.removeButtons || !this.removeButtons.length) return;

      this.removeButtons.forEach(button => {
        // Encontrar el row que contiene este botón
        const row = button.closest('.variant-table__row');
        if (!row) return;

        // Obtener el contenedor del botón
        const container = button.closest('.variant-table__remove-container');
        if (!container) return;

        // Extraer el ID de variante de data-variant-row
        const variantId = parseInt(row.getAttribute('data-variant-row'));
        if (!variantId) return;

        // Verificar si esta variante está en el carrito
        const variantInCart = cartItems.some(item => item.variant_id === variantId && item.quantity > 0);

        // Mostrar/ocultar el contenedor basado en si la variante está en el carrito
        container.classList.toggle('hidden', !variantInCart);

        // Guardar el variantId en el botón para accederlo cuando se haga clic
        button.setAttribute('data-variant-id', variantId);
      });
    }

    // Manejar clics en botones de eliminar
    async handleRemoveButtonClick(event) {
      event.preventDefault();

      if (this._state.isUpdating) return;

      this.enableLoader();

      const button = event.currentTarget;
      const variantId = button.getAttribute('data-variant-id');

      if (!variantId) {
        console.error('Error: No variant ID found on remove button');
        return;
      }

      // Usar el método existente updateCartItem para establecer la cantidad a 0
      await this.updateCartItem(variantId, 0);

      // Ocultar el contenedor después de eliminar
      const container = button.closest('.variant-table__remove-container');
      if (container) {
        container.classList.add('hidden');
      }

      // También actualizar el input correspondiente a 0
      const row = button.closest('.variant-table__row');
      if (row) {
        const input = row.querySelector('.variant-table__quantity');
        if (input) {
          input.value = 0;
        }
      }
    }

    updateTableTotals(cartItems) {
      if (!this.subtotalValueEl || !this.totalItemsValueEl || !this._state.isTableLoaded) return;

      // Obtener el ID del producto actual
      const currentProductId = this.data.product.id;

      let totalItems = 0;
      let subtotal = 0;

      // Obtener todas las variantes de este producto
      const productVariantIds = this.data.product.variants.map(variant => variant.id);

      // Calcular totales para todas las variantes de este producto
      cartItems.forEach(item => {
        // Verificar si este item del carrito es una variante de nuestro producto actual
        if (productVariantIds.includes(item.variant_id)) {
          totalItems += item.quantity;
          subtotal += item.final_line_price; // Usar final_line_price para incluir descuentos
        }
      });

      // Actualizar los elementos en el DOM
      this.totalItemsValueEl.innerHTML = `<strong>${totalItems}</strong>`;
      this.subtotalValueEl.innerHTML = `<strong>${this.formatMoney(subtotal)} €</strong>`;
    }

    formatMoney(cents) {
      if (typeof window.theme === 'undefined' || !window.theme.moneyFormat) {
        // Si no hay formato definido, usamos formato español por defecto
        return `${(cents / 100).toFixed(2).replace('.', ',')}`;
      }

      // Convertir de centavos a unidades con 2 decimales
      let amount = (cents / 100).toFixed(2);

      // Para el formato español, reemplazamos el punto por coma
      amount = amount.replace('.', ',');

      return window.theme.moneyFormat.replace(/{{amount}}/g, amount).replace(' €', '');
    }

    // Manejo para el botón "Borrar Todo" (quita todas las variantes del producto)
    async handleClearAll(event) {
      event.preventDefault();

      if (this._state.isUpdating) return;

      try {
        this._state.isUpdating = true;

        // Obtener todas las variantes de este producto
        const productVariantIds = this.data.product.variants.map(variant => variant.id);

        if (productVariantIds.length === 0) return;

        // Obtener el carrito actual
        const cartResponse = await fetch('/cart.js');
        const cart = await cartResponse.json();

        // Crear actualizaciones para eliminar todas las variantes del producto
        const updates = {};

        // Verificar cada item del carrito
        cart.items.forEach(item => {
          // Si el item es una variante de este producto, establecer cantidad a 0
          if (productVariantIds.includes(item.variant_id)) {
            updates[item.id] = 0;
          }
        });

        // Si no hay nada que actualizar, salir
        if (Object.keys(updates).length === 0) return;

        // Actualizar el carrito
        const response = await fetch('/cart/update.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ updates })
        });

        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const updatedCart = await response.json();

        // Actualizar la interfaz
        this.updateQuantityInputs(updatedCart.items);

        // Refrescar drawer del carrito
        document.dispatchEvent(new CustomEvent('dispatch:cart-drawer:refresh', {
          bubbles: true
        }));

        // Actualizar el ícono del carrito en Header
        await this.updateCartIconBubble();

      } catch (error) {
        console.error('Error clearing items:', error);
        document.dispatchEvent(new CustomEvent('on:cart:error', {
          detail: { error: error.message },
          bubbles: true
        }));
      } finally {
        this._state.isUpdating = false;
        // Ocultar loaders y restaurar interactividad
        this.disableAllLoaders();
      }
    }

    // Manejo para el botón "Ver Cesta"
    handleViewCart(event) {
/*       event.preventDefault();

      // Abrir el drawer del carrito utilizando el evento del tema
      document.dispatchEvent(new CustomEvent('dispatch:cart-drawer:open', {
        bubbles: true
      })); */
    }

    // Activar los loaders
    enableLoader() {
      if (!this._state.isTableLoaded) return;

      // Mostrar loader de totales
      if (this.totalsLoader) {
        this.totalsLoader.classList.remove('hidden');
      }

      // Bloquear interactividad de la tabla
      if (this.variantTable) {
        this.variantTable.classList.add('pointer-events-none');
      }

      // Quitar foco del elemento activo
      if (document.activeElement) {
        document.activeElement.blur();
      }
    }

    // Ocultar todos los loaders
    disableAllLoaders() {
      if (!this._state.isTableLoaded) return;

      // Ocultar loader de totales
      if (this.totalsLoader) {
        this.totalsLoader.classList.add('hidden');
      }

      // Restaurar interactividad de la tabla
      if (this.variantTable) {
        this.variantTable.classList.remove('pointer-events-none');
      }
    }

    /**
     * Obtiene la sección cart-icon-bubble y la actualiza en el encabezado
     */
    async updateCartIconBubble() {
      try {
        // Solicitar solo la sección del icono del carrito
        const response = await fetch('/?sections=cart-icon-bubble');
        if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);
        
        const data = await response.json();
        
        // Verificar que tengamos la sección que necesitamos
        if (!data || !data['cart-icon-bubble']) {
          throw new Error('Missing cart-icon-bubble section in response');
        }
        
        // Actualizar el HTML del icono del carrito
        const cartIconBubble = document.getElementById('cart-icon-bubble');
        if (cartIconBubble) {
          cartIconBubble.innerHTML = data['cart-icon-bubble'];
        }
      } catch (error) {
        console.error('Error updating cart icon:', error);
      }
    }
  }
  customElements.define('upng-variant-picker', VariantPicker);
}