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



if (!customElements.get('variant-picker')) {
  class VariantPicker extends HTMLElement {
    constructor() {
      super();
      this.section = this.closest('.js-product');
      this.productForm = this.section.querySelector('.js-product-form-main');
      this.optionSelectors = this.querySelectorAll('.option-selector');
      this.data = this.getProductData();
      this.variant = this.getSelectedVariant();
      this.selectedOptions = this.getSelectedOptions();
      this.preSelection = !this.variant && this.selectedOptions.find((o) => o === null) === null;

      // Variables para los datos de GraphQL
      this.graphqlData = null;
      this.isLoadingGraphQL = false;
      
      this.addEventListener('change', this.handleVariantChange.bind(this));

      // Defer these to allow for quick-add modal to full initialize
      setTimeout(() => {
        this.updateAvailability();
        this.updateAddToCartButton();
      });
    }

    /**
     * Se ejecuta cuando el elemento se conecta al DOM
     * Aquí iniciamos el fetch de datos de GraphQL
     */
    async connectedCallback() {
      console.log('🔍 connectedCallback ejecutado');
      // Obtener el handle del producto
      const productHandle = this.getProductHandle();
      console.log('🔍 Product handle obtenido:', productHandle);
      
      if (productHandle) {
        console.log(`🚀 Iniciando fetch de variantes para: ${productHandle}`);
        try {
          this.isLoadingGraphQL = true;
          this.graphqlData = await this.fetchAllVariants(productHandle);
          console.log('✅ Datos de GraphQL obtenidos:', this.graphqlData);
          
          // Una vez que tenemos los datos, podemos generar la tabla de variantes
          //await this.generateVariantTable();
          
        } catch (error) {
          console.error('❌ Error al obtener datos de GraphQL:', error);
        } finally {
          this.isLoadingGraphQL = false;
        }
      }
    }

    /**
     * Obtiene el handle del producto desde los datos o desde la URL
     * @returns {string|null}
     */
    getProductHandle() {
      // Opción 1: Desde los datos del producto
      if (this.data?.product?.handle) {
        return this.data.product.handle;
      }
      
      // Opción 2: Desde la URL actual
      const pathSegments = window.location.pathname.split('/');
      const productIndex = pathSegments.indexOf('products');
      if (productIndex !== -1 && pathSegments[productIndex + 1]) {
        return pathSegments[productIndex + 1];
      }
      
      // Opción 3: Desde un atributo data del elemento
      if (this.dataset.productHandle) {
        return this.dataset.productHandle;
      }
      
      return null;
    }

    /**
     * Obtiene todas las variantes de un producto específico con GraphQL
     * @param {string} productHandle - Handle del producto
     * @returns {Promise<Object>}
     */
    async fetchAllVariants(productHandle) {
      try {
        let hasNextPage = true;
        let cursor = null;
        let allVariants = [];
        let productData = null;

        // Verificar que tenemos las constantes necesarias
        if (typeof DOMAIN === 'undefined' || typeof STOREFRONT_ACCESS_TOKEN === 'undefined') {
          throw new Error('DOMAIN y STOREFRONT_ACCESS_TOKEN deben estar definidos');
        }

        while (hasNextPage) {
          const query = `
            query getProductVariants($handle: String!, $cursor: String) {
              product(handle: $handle) {
                id
                title
                handle
                featuredImage {
                  url
                  altText
                }
                options {
                  id
                  name
                  values
                }
                variants(first: 100, after: $cursor) {
                  pageInfo {
                    hasNextPage
                  }
                  edges {
                    cursor
                    node {
                      id
                      title
                      price {
                        amount
                        currencyCode
                      }
                      inventoryQuantity
                      inventoryManagement
                      selectedOptions {
                        name
                        value
                      }
                      image {
                        url
                        altText
                      }
                      galeriaImagenes: metafield(namespace: "upng", key: "galeria_imagenes") {
                        value
                      }
                      descatalogado: metafield(namespace: "upng", key: "descatalogado") {
                        value
                      }
                      privado: metafield(namespace: "upng", key: "privado") {
                        value
                      }
                    }
                  }
                }
              }
            }
          `;

          const variables = {
            handle: productHandle,
            cursor
          };

          const response = await fetch(`https://${DOMAIN}/api/2024-07/graphql.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Storefront-Access-Token': STOREFRONT_ACCESS_TOKEN,
            },
            body: JSON.stringify({ query, variables }),
          });

          const result = await response.json();

          // Verificar si hay errores en la respuesta
          if (result.errors) {
            console.error('❌ Error en GraphQL:', result.errors);
            throw new Error('Error en la consulta GraphQL');
          }

          const product = result.data?.product;
          if (!product) {
            throw new Error(`Producto con handle "${productHandle}" no encontrado`);
          }

          // Guardar datos del producto en la primera iteración
          if (!productData) {
            productData = {
              id: product.id,
              title: product.title,
              handle: product.handle,
              featuredImage: product.featuredImage,
              options: product.options
            };
          }

          const edges = product.variants?.edges || [];
          
          // Agregar variantes al array
          edges.forEach(edge => {
            allVariants.push(edge.node);
          });

          hasNextPage = product.variants?.pageInfo?.hasNextPage || false;
          cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
        }

        console.log(`✅ Obtenidas ${allVariants.length} variantes para el producto: ${productData.title}`);
        
        return {
          product: productData,
          variants: allVariants
        };

      } catch (error) {
        console.error('❌ Error fatal en fetchAllVariants:', error);
        throw error;
      }
    }

    /**
     * Handles 'change' events on the variant picker element.
     * @param {object} evt - Event object.
     */
    handleVariantChange(evt) {
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
      VariantPicker.updateLabelText(evt);

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
      }
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
  }

  customElements.define('variant-picker', VariantPicker);
}
