/**
 * NUEVO Variant Picker - REFACTORIZADO
 * - Selector de opciones sobre la option1 (Color)
 * - Fetch de vista alternativa 'product.upng-variant-table' con variante seleccionada
 *
 * Dependencies:
 * - Custom select component
 *
 * CHANGELOG v2.0:
 * - Eliminado código duplicado (métodos utilitarios)
 * - Fix race condition en refetch de tabla
 * - Optimización O(n²) → O(n) en updateAvailability
 * - Event listeners consolidados
 * - Memory leaks corregidos
 * - Error handling mejorado
 */

if (!customElements.get("upng-variant-picker")) {
  class VariantPicker extends HTMLElement {
    constructor() {
      super();

      // Estado interno unificado
      this._state = {
        loading: {
          graphql: false,
          table: false,
          cart: false,
          updating: false,
          fetchingTable: false
        },
        data: {
          currentColorVariantId: null,
          pendingChanges: {},
          cartItems: []
        },
        flags: {
          graphqlReady: false,
          tableLoaded: false,
          cartSynced: false
        }
      };

      // Caché para optimizaciones
      this._cache = {
        variantIndex: null,
        stockIndicators: null
      };

      // Control de fetches (para cancelación)
      this._fetchControllers = {
        graphql: null,
        table: null
      };

      // Iniciar GraphQL en paralelo
      this._graphqlPromise = this.fetchAndMergeGraphQLData();

      // Bind de métodos
      this.boundHandleCartAdd = this.handleCartAdd.bind(this);
      this.boundHandleLineItemChange = this.handleLineItemChange.bind(this);
      this.boundHandleQuantityChange = this.handleQuantityChange.bind(this);
      this.boundHandleQuantityButtonClick = this.handleQuantityButtonClick.bind(this);
      this.boundUpdateLimitState = (event) => this.updateLimitState(event.target);
      this.boundHandleInputFocus = this.handleInputFocus.bind(this);
      this.boundHandleInputKeydown = this.handleInputKeydown.bind(this);
      this.boundHandleRemoveButtonClick = this.handleRemoveButtonClick.bind(this);

      // binding para Sincronizar con quick-add
      this.boundHandleCartUpdate = this.handleCartUpdate.bind(this);

      // Mantener inicializaciones originales del tema
      this.section = this.closest(".js-product");
      this.productForm = this.section.querySelector(".js-product-form-main");
      this.optionSelectors = this.querySelectorAll(".option-selector");
      this.data = this.getProductData();
      this.variant = this.getSelectedVariant();
      this.selectedOptions = this.getSelectedOptions();
      this.preSelection = !this.variant && this.selectedOptions.find((o) => o === null) === null;

      // Event listener principal
      this.addEventListener("change", this.handleVariantChange.bind(this));

      // Inicialización del tema
      setTimeout(() => {
        this.updateAvailability();
        this.updateAddToCartButton();
        this.updateTratamientos();
      });

      // Inicializar tabla y sincronización
      setTimeout(() => {
        this.initTableAndSync();
      }, 100);
    }

    // ============================================================================
    // GRAPHQL - FETCH Y MERGE
    // ============================================================================

    /**
     * Obtiene todas las variantes vía GraphQL con paginación
     * @returns {Promise<Object|null>} Objeto con product y variants, o null si falla
     */
    async fetchAllVariantsData() {
      const DOMAIN = "garys-b2benterprise.myshopify.com";
      const STOREFRONT_ACCESS_TOKEN = "a12948ac9a26fdb704467b281c0d3217";
      const productUrl = this.dataset.url;
      const PRODUCT_HANDLE = productUrl.replace("/products/", "");

      try {
        let hasNextPage = true;
        let cursor = null;
        let allVariants = [];
        let productData = null;

        while (hasNextPage) {
          const query = `
            query getProductVariants($handle: String!, $cursor: String) {
              product(handle: $handle) {
                id
                title
                handle
                variants(first: 250, after: $cursor) {
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                  edges {
                    cursor
                    node {
                      id
                      title
                      sku
                      barcode
                      availableForSale
                      quantityAvailable
                      price {
                        amount
                        currencyCode
                      }
                      compareAtPrice {
                        amount
                        currencyCode
                      }
                      unitPrice {
                        amount
                        currencyCode
                      }
                      unitPriceMeasurement {
                        measuredType
                        quantityUnit
                        quantityValue
                        referenceUnit
                        referenceValue
                      }
                      weight
                      weightUnit
                      selectedOptions {
                        name
                        value
                      }
                      image {
                        url
                        altText
                      }
                      descatalogado: metafield(namespace: "upng", key: "descatalogado") {
                        value
                      }
                      privado: metafield(namespace: "upng", key: "privado") {
                        value
                      }
                      stockDisponible: metafield(namespace: "upng", key: "stock_disponible") {
                        value
                      }
                      idErp: metafield(namespace: "upng", key: "id_erp") {
                        value
                      }
                      icono: metafield(namespace: "upng", key: "icono_color") {
                        reference {
                          ... on MediaImage {
                            image {
                              url
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          `;

          const variables = { handle: PRODUCT_HANDLE, cursor };

          const response = await fetch(
            `https://${DOMAIN}/api/2024-10/graphql.json`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Storefront-Access-Token": STOREFRONT_ACCESS_TOKEN,
              },
              body: JSON.stringify({ query, variables }),
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const result = await response.json();

          if (result.errors) {
            throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
          }

          if (!result.data?.product) {
            throw new Error(`Product not found: ${PRODUCT_HANDLE}`);
          }

          const { data } = result;

          if (!productData) {
            productData = data.product;
          }

          const variantsInPage = data.product.variants.edges.map((edge) => edge.node);
          allVariants.push(...variantsInPage);

          hasNextPage = data.product.variants.pageInfo.hasNextPage;
          cursor = data.product.variants.pageInfo.endCursor;
        }

        return {
          product: productData,
          variants: allVariants,
        };
      } catch (error) {
        console.error("Error loading variants via GraphQL:", error);
        return null;
      }
    }

    /**
     * Orquestador principal de GraphQL - fetch y merge con datos Liquid
     */
    async fetchAndMergeGraphQLData() {
      this._state.loading.graphql = true;

      try {
        const graphqlData = await this.fetchAllVariantsData();

        if (!graphqlData || !graphqlData.variants) {
          console.warn("GraphQL fetch returned no data, using Liquid fallback");
          return;
        }

        this.mergeGraphQLVariants(graphqlData.variants);
        this._state.flags.graphqlReady = true;
      } catch (error) {
        console.error("Error fetching GraphQL data:", error);
      } finally {
        this._state.loading.graphql = false;
      }
    }

    /**
     * Transforma variante de GraphQL a formato Liquid
     * @param {Object} graphqlVariant - Variante en formato GraphQL
     * @returns {Object} Variante en formato Liquid
     */
    transformGraphQLVariant(graphqlVariant) {
      const numericId = parseInt(graphqlVariant.id.split("/").pop());
      const options = graphqlVariant.selectedOptions.map((opt) => opt.value);

      return {
        id: numericId,
        title: graphqlVariant.title,
        option1: options[0] || null,
        option2: options[1] || null,
        option3: options[2] || null,
        options: options,
        price: Math.round(parseFloat(graphqlVariant.price.amount) * 100),
        compare_at_price: graphqlVariant.compareAtPrice
          ? Math.round(parseFloat(graphqlVariant.compareAtPrice.amount) * 100)
          : null,
        available: graphqlVariant.availableForSale,
        sku: graphqlVariant.sku,
        barcode: graphqlVariant.barcode,
        weight: graphqlVariant.weight,
        weight_unit: graphqlVariant.weightUnit?.toLowerCase() || "kg",
        inventory_management: graphqlVariant.quantityAvailable !== null ? "shopify" : null,
        inventory_quantity: graphqlVariant.quantityAvailable,
        featured_media: graphqlVariant.image
          ? {
              id: null,
              src: graphqlVariant.image.url,
              alt: graphqlVariant.image.altText,
            }
          : null,
        unit_price: graphqlVariant.unitPrice
          ? Math.round(parseFloat(graphqlVariant.unitPrice.amount) * 100)
          : null,
        unit_price_measurement:
          graphqlVariant.unitPriceMeasurement?.quantityValue > 0
            ? {
                reference_value: graphqlVariant.unitPriceMeasurement.referenceValue,
                reference_unit: graphqlVariant.unitPriceMeasurement.referenceUnit?.toLowerCase(),
              }
            : null,
        metafields: {
          upng: {
            descatalogado:
              graphqlVariant.descatalogado?.value === "true" ||
              graphqlVariant.descatalogado?.value === true,
            privado:
              graphqlVariant.privado?.value === "true" ||
              graphqlVariant.privado?.value === true,
            stock_disponible: graphqlVariant.stockDisponible?.value
              ? parseInt(graphqlVariant.stockDisponible.value)
              : null,
            id_erp: graphqlVariant.idErp?.value || null,
            icono_color: graphqlVariant.icono?.reference?.image?.url || null,
          },
        },
      };
    }

    /**
     * Genera precios formateados para una variante
     * @param {Object} variant - Variante en formato Liquid
     * @returns {Object} Objeto con precios formateados
     */
    generateFormattedPrice(variant) {
      const formatPrice = (cents) => {
        return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
      };

      const formatted = {
        price: formatPrice(variant.price),
      };

      if (variant.compare_at_price && variant.compare_at_price > variant.price) {
        formatted.compareAtPrice = formatPrice(variant.compare_at_price);
      }

      if (variant.unit_price) {
        formatted.unitPrice = formatPrice(variant.unit_price);
      }

      if (variant.inventory_management && variant.inventory_quantity <= 0) {
        formatted.inventory = "none";
      }

      if (variant.weight) {
        formatted.weight = `${variant.weight} ${variant.weight_unit}`;
      }

      return formatted;
    }

    /**
     * Hace merge de variantes GraphQL con datos Liquid existentes
     * @param {Array} graphqlVariants - Array de variantes GraphQL
     */
    mergeGraphQLVariants(graphqlVariants) {
      const transformedVariants = graphqlVariants.map((gqlVariant) =>
        this.transformGraphQLVariant(gqlVariant)
      );

      const newFormatted = {};
      transformedVariants.forEach((variant) => {
        newFormatted[variant.id] = this.generateFormattedPrice(variant);
      });

      // Merge híbrido: sobrescribir variants y formatted
      this.data.product.variants = transformedVariants;
      this.data.formatted = newFormatted;

      // Invalidar cachés
      this.invalidateCache();

      // Aplicar filtro de outlet si corresponde
      if (this._state.flags.tableLoaded) {
        this.scheduleOutletFilter();
      }
    }

    // ============================================================================
    // VARIANT HANDLING (Tema original)
    // ============================================================================

    /**
     * Maneja cambios en las opciones de variante
     * @param {Event} evt - Evento de cambio
     */
    handleVariantChange(evt) {
      // Ignorar si viene de input de cantidad
      if (evt.target.classList.contains("variant-table__quantity")) {
        return;
      }

      const previousVariant = this.variant;

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
      this.updateTratamientos();

      if (evt.target.closest(".option-selector")) {
        VariantPicker.updateLabelText(evt);
      }

      // Detectar cambio de color y refetch de tabla
      if (this._state.flags.tableLoaded) {
        const colorChanged =
          previousVariant &&
          this.variant &&
          previousVariant.option1 !== this.variant.option1;

        if (colorChanged) {
          this.refetchTableByColor(this.variant.id);
        }
      }

      if (!this.preSelection) {
        this.dispatchEvent(
          new CustomEvent("on:variant:change", {
            bubbles: true,
            detail: {
              form: this.productForm,
              variant: this.variant,
              product: this.data.product,
            },
          })
        );
      }
    }

    /**
     * Actualiza el botón "Add to Cart" (lógica del tema)
     */
    updateAddToCartButton() {
      this.productForm = this.section.querySelector(".js-product-form-main");
      if (!this.productForm) return;
    }

    /**
     * Ajax para actualizar iconos de tratamientos
     */
    async updateTratamientos() {
      if (!this.variant) return;

      const treatmentContainers = document.querySelectorAll(".tratamiento-icons-container");
      if (treatmentContainers.length === 0) return;

      try {
        const response = await fetch(
          `${window.location.pathname}?variant=${this.variant.id}&view=upng-tratamientos`
        );
        if (!response.ok) throw new Error("Error loading treatment data");

        const html = await response.text();
        treatmentContainers.forEach((container) => {
          container.innerHTML = html;
        });
      } catch (error) {
        console.error("Error updating treatment icons:", error);
      }
    }

    /**
     * Muestra/oculta elementos con metafields de variante
     */
    updateMetafieldVisibility() {
      document.querySelectorAll("[data-variant-metafield]").forEach((elem) => {
        elem.classList.toggle(
          "hidden",
          elem.dataset.variantMetafield !== this.variant?.id.toString()
        );
      });
    }

    /**
     * Actualiza disponibilidad de opciones en selectores
     * OPTIMIZADO: O(n²) → O(n) usando índice de variantes
     */
    updateAvailability() {
      if (this.dataset.showAvailability === "false") return;

      const { availabilityMethod } = this.dataset;
      let currVariant = this.variant || { options: this.selectedOptions };

      // Construir índice si no existe
      const index = this.getVariantIndex();

      if (availabilityMethod === "selection") {
        this.querySelectorAll(".js-option").forEach((optionEl) => {
          VariantPicker.updateOptionAvailability(optionEl, false, false);
        });

        this.optionSelectors.forEach((selector, selectorIndex) => {
          const matchingVariants = this.findMatchingVariants(
            currVariant.options,
            selectorIndex,
            index
          );

          matchingVariants.forEach((variant) => {
            const options = selector.querySelectorAll(".js-option");
            const optionEl = Array.from(options).find((opt) => {
              const value =
                selector.dataset.selectorType === "dropdown"
                  ? opt.dataset.value
                  : opt.value;
              return value === variant.options[selectorIndex];
            });

            if (optionEl) {
              VariantPicker.updateOptionAvailability(optionEl, true, variant.available);
            }
          });
        });
      } else {
        // Método "downward"
        this.optionSelectors.forEach((selector, selectorIndex) => {
          const options = selector.querySelectorAll('.js-option:not([data-value=""])');

          options.forEach((option) => {
            const optionValue =
              selector.dataset.selectorType === "dropdown"
                ? option.dataset.value
                : option.value;

            const key = `${selectorIndex}-${optionValue}`;
            const variantsWithThisOption = index.byOption.get(key) || [];

            let variantsExist = false;
            let variantsAvailable = false;

            variantsWithThisOption.forEach((v) => {
              let matches = 0;
              for (let i = 0; i < selectorIndex; i++) {
                if (
                  v.options[i] === this.selectedOptions[i] ||
                  this.selectedOptions[i] === null
                ) {
                  matches++;
                }
              }

              if (matches === selectorIndex) {
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
     * Actualiza estado de disponibilidad de una opción
     * @param {Element} optionEl - Elemento de opción
     * @param {boolean} exists - ¿Existe variante con esta opción?
     * @param {boolean} available - ¿Está disponible?
     */
    static updateOptionAvailability(optionEl, exists, available) {
      const el = optionEl;
      const unavailableText = exists ? theme.strings.noStock : theme.strings.noVariant;
      el.classList.toggle("is-unavailable", !available);
      el.classList.toggle("is-nonexistent", !exists);

      if (optionEl.classList.contains("custom-select__option")) {
        const em = el.querySelector("em");

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
        el.nextElementSibling.removeAttribute("title");
      }
    }

    updateBackorderText() {
      this.backorder = this.backorder || this.section.querySelector(".backorder");
      if (!this.backorder) return;

      let hideBackorder = true;

      if (this.variant && this.variant.available) {
        const { inventory } = this.data.formatted[this.variant.id];

        if (this.variant.inventory_management && inventory === "none") {
          const backorderProdEl = this.backorder.querySelector(".backorder__product");
          const prodTitleEl = this.section.querySelector(".product-title");
          const variantTitle = this.variant.title.includes("Default")
            ? ""
            : ` - ${this.variant.title}`;

          backorderProdEl.textContent = `${prodTitleEl.textContent}${variantTitle}`;
          hideBackorder = false;
        }
      }

      this.backorder.hidden = hideBackorder;
    }

    /**
     * Actualiza texto del label de color
     */
    static updateLabelText(evt) {
      const selector = evt.target.closest(".option-selector");
      if (selector.dataset.selectorType === "dropdown") return;

      const colorText = selector.querySelector(".js-color-text");
      if (!colorText) return;

      colorText.textContent = evt.target.nextElementSibling.querySelector(".js-value").textContent;
    }

    updateMedia() {
      if (!this.variant.featured_media) return;

      if (this.section.matches("quick-add-drawer")) {
        this.section.updateMedia(this.variant.featured_media.id);
      } else {
        this.mediaGallery = this.mediaGallery || this.section.querySelector("media-gallery");
        if (!this.mediaGallery) return;

        const variantMedia = this.mediaGallery.querySelector(
          `[data-media-id="${this.variant.featured_media.id}"]`
        );
        this.mediaGallery.setActiveMedia(variantMedia, true, true);
      }
    }

    updatePickupAvailability() {
      this.pickUpAvailability =
        this.pickUpAvailability || this.section.querySelector("pickup-availability");
      if (!this.pickUpAvailability) return;

      if (this.variant && this.variant.available) {
        this.pickUpAvailability.getAvailability(this.variant.id);
      } else {
        this.pickUpAvailability.removeAttribute("available");
        this.pickUpAvailability.innerHTML = "";
      }
    }

    /**
     * Actualiza el precio principal del producto basándose en el precio más bajo de la tabla
     * 
     * Este método espera a que el tbody de la tabla esté cargado, luego:
     * 1. Busca todos los elementos .price__current dentro del tbody
     * 2. Extrae y parsea los valores numéricos de cada precio
     * 3. Encuentra el precio más bajo
     * 4. Actualiza el precio principal en .product-info__price
     *  
     * @note
     * - Si no hay tabla cargada, no hace nada
     * - Si no encuentra precios en el tbody, no actualiza nada
     * - Maneja formatos con coma decimal (ej: "38,56 €")
     * - Es llamado automáticamente después de refetchTableByColor()
     */
    async updatePrice() {
      // Verificar que la tabla esté cargada
      if (!this._state.flags.tableLoaded || !this.variantTable) {
        return;
      }

      // Buscar el contenedor principal de precio
      this.price = this.price || this.section.querySelector(".product-info__price > .price");
      if (!this.price) return;

      // Buscar el elemento donde se mostrará el precio
      const priceCurrentEl = this.price.querySelector(".price__current");
      if (!priceCurrentEl) return;

      // Buscar el tbody de la tabla
      const tbody = this.variantTable.querySelector("tbody");
      if (!tbody) return;

      // Buscar todos los precios en el tbody
      const priceElements = tbody.querySelectorAll(".price__current");
      
      if (priceElements.length === 0) {
        return;
      }

      // Extraer y parsear todos los precios
      const prices = [];
      priceElements.forEach((el) => {
        const priceText = el.textContent.trim();
        // Parsear precio: "38,56 €" → 38.56
        const priceValue = parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.'));
        
        if (!isNaN(priceValue)) {
          prices.push({
            value: priceValue,
            text: priceText
          });
        }
      });

      // Si no hay precios válidos, salir
      if (prices.length === 0) {
        return;
      }

      // Encontrar el precio más bajo
      const lowestPrice = prices.reduce((min, current) => {
        return current.value < min.value ? current : min;
      });

      // Actualizar el precio principal con el texto original del precio más bajo
      priceCurrentEl.innerHTML = lowestPrice.text;
    }

    updateWeight() {
      this.weights = this.weights || this.section.querySelectorAll(".product-info__weight");
      if (this.weights.length === 0) return;

      const weightAvailable = this.variant && this.variant.weight > 0;
      this.weights.forEach((weight) => {
        weight.textContent = weightAvailable ? this.data.formatted[this.variant.id].weight : "";
        weight.hidden = !weightAvailable;
      });
    }

    updateBarcode() {
      this.barcodes =
        this.barcodes || this.section.querySelectorAll(".product-info__barcode-value");
      if (this.barcodes.length === 0) return;

      const barcodeAvailable = this.variant && this.variant.barcode;
      this.barcodes.forEach((barcode) => {
        barcode.textContent = barcodeAvailable ? this.variant.barcode : "";
        barcode.parentNode.hidden = !barcodeAvailable;
      });
    }

    updateSku() {
      this.sku = this.sku || this.section.querySelector(".product-sku__value");
      if (!this.sku) return;

      const skuAvailable = this.variant && this.variant.sku;
      this.sku.textContent = skuAvailable ? this.variant.sku : "";
      this.sku.parentNode.hidden = !skuAvailable;
    }

    updateUrl(evt) {
      return; // Desconectado por utilidad de Outlets
    }

    updateVariantInput() {
      this.forms =
        this.forms ||
        this.section.querySelectorAll(".js-product-form-main, .js-instalments-form");

      this.forms.forEach((form) => {
        const input = form.querySelector('input[name="id"]');
        input.value = this.variant.id;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }

    /**
     * Obtiene opciones seleccionadas
     * @returns {Array} Array de valores de opciones
     */
    getSelectedOptions() {
      const selectedOptions = [];

      this.optionSelectors.forEach((selector) => {
        if (selector.dataset.selectorType === "dropdown") {
          const selectedText = selector.querySelector(".custom-select__btn").textContent.trim();
          selectedOptions.push(
            selectedText === this.dataset.placeholderText ? null : selectedText
          );
        } else {
          const selected = selector.querySelector("input:checked");
          selectedOptions.push(selected ? selected.value : null);
        }
      });

      return selectedOptions;
    }

    /**
     * Obtiene datos del producto desde JSON embebido
     * @returns {Object} Datos del producto
     */
    getProductData() {
      const dataEl = this.querySelector('[type="application/json"]');
      return JSON.parse(dataEl.textContent);
    }

    /**
     * Obtiene variante seleccionada basada en opciones
     * @returns {Object|null} Variante seleccionada o null
     */
    getSelectedVariant() {
      const selectedOptions = this.getSelectedOptions();

      if (!selectedOptions || !selectedOptions[0]) return null;

      const normalize = (val) => (val || "").toString().trim().toLowerCase();
      const selectedColor = normalize(selectedOptions[0]);

      // Buscar primera variante disponible con ese color
      const matchingVariant = this.data.product.variants.find((variant) => {
        const colorValue = normalize(variant.options[0]);
        return colorValue === selectedColor && variant.available;
      });

      // Si no hay disponibles, tomar primera del color
      return (
        matchingVariant ||
        this.data.product.variants.find(
          (variant) => normalize(variant.options[0]) === selectedColor
        ) ||
        null
      );
    }

    // ============================================================================
    // TABLA DE VARIANTES - INICIALIZACIÓN Y REFETCH
    // ============================================================================

    /**
     * Inicializa tabla y sincronización con carrito
     */
    async initTableAndSync() {
      try {
        await this.loadVariantTable();
        this._state.flags.tableLoaded = true;

        await this.initCartSync();
        this._state.flags.cartSynced = true;

        this.initAddToCartButton();
      } catch (error) {
        console.error("Error during table and cart sync initialization:", error);
      }
    }

    /**
     * Carga la tabla de variantes por primera vez
     * Solo inserta el tbody en la tabla existente
     */
    async loadVariantTable() {
      if (this._state.flags.tableLoaded) return;

      try {
        const productUrl = this.dataset.url;

        // Determinar variante inicial
        let initialVariant = this.variant;

        if (!initialVariant) {
          initialVariant = this.data.product.variants.find((v) => v.available);

          if (!initialVariant && this.data.product.variants.length > 0) {
            initialVariant = this.data.product.variants[0];
          }
        }

        if (!initialVariant) {
          console.warn("No variant found to load table");
          return;
        }

        // Buscar tabla existente en el DOM
        this.variantTable = this.querySelector(".variant-table");
        
        if (!this.variantTable) {
          console.error("Table element not found in DOM");
          return;
        }

        // Buscar tbody existente (vacío)
        const existingTbody = this.variantTable.querySelector("tbody");
        
        if (!existingTbody) {
          console.error("Tbody element not found in table");
          return;
        }

        // Fetch HTML del tbody
        const tableViewUrl = `${productUrl}?variant=${initialVariant.id}&view=upng-variant-table`;
        const response = await fetch(tableViewUrl);

        if (!response.ok) throw new Error("Failed to load variant table");

        const tbodyHtml = await response.text();

        // Reemplazar contenido del tbody
        existingTbody.innerHTML = tbodyHtml;

        // Actualizar referencias DOM
        this.updateTableDOMReferences();

        // Guardar color actual
        this._state.data.currentColorVariantId = initialVariant.id;

        // Inicializar eventos
        this.attachTableEventListeners();

        // Aplicar filtro de outlet
        this.scheduleOutletFilter();
      } catch (error) {
        console.error("Error loading variant table:", error);
        throw error;
      } finally {
        // Aplicar visibilidad de precios
        const isPvdVisible = localStorage.getItem("pvdVisible") !== "false";
        if (isPvdVisible && this.prices) {
          this.prices.forEach((el) => {
            el.style.display = "block";
          });
        }
      }
    }

    /**
     * Refetch de tabla cuando cambia el color
     * @param {number} variantId - ID de la nueva variante de color
     */
    async refetchTableByColor(variantId) {
      // Evitar múltiples fetches simultáneos
      if (this._state.loading.fetchingTable) return;

      // Si el color ya está mostrado, no hacer nada
      if (this._state.data.currentColorVariantId === variantId) return;

      // Cancelar fetch anterior si existe
      this.cancelTableFetch();

      // Crear nuevo AbortController
      this._fetchControllers.table = new AbortController();
      const signal = this._fetchControllers.table.signal;
      const targetVariantId = variantId;

      try {
        this._state.loading.fetchingTable = true;

        this.disableColorSelectors();

        const productUrl = this.dataset.url;
        const tableViewUrl = `${productUrl}?variant=${variantId}&view=upng-variant-table`;

        const response = await fetch(tableViewUrl, { signal });

        if (!response.ok) throw new Error("Failed to refetch variant table");

        const tbodyHtml = await response.text();

        // Verificar que no fue cancelado
        if (signal.aborted) return;

        // Verificar que la variante actual sigue siendo la que pedimos
        if (this.variant?.id !== targetVariantId) return;

        // Limpiar listeners antes de reemplazar
        this.detachTableEventListeners();

        // Reemplazar solo tbody
        this.replaceTbodyContent(tbodyHtml);

        // Actualizar referencias
        this.updateTableDOMReferences();

        // Re-agregar listeners
        this.attachTableEventListeners();

        // Actualizar tracking
        this._state.data.currentColorVariantId = variantId;

        // Sincronizar con carrito actual
        if (this._state.data.cartItems) {
          this.updateQuantityInputs(this._state.data.cartItems);
        }

        // Restaurar cambios pendientes
        this.restorePendingChangesForCurrentColor();

        // Actualizar totales y botones
        const simulatedItems = this.getSimulatedCartItems();
        this.updateRemoveButtonsVisibility(simulatedItems);
        this.updateAllStockIndicators(this._state.data.cartItems);

        // Aplicar filtro de outlet
        this.scheduleOutletFilter();

        // Aplicar visibilidad de precios
        const isPvdVisible = localStorage.getItem("pvdVisible") !== "false";
        if (isPvdVisible && this.prices) {
          this.prices.forEach((el) => {
            el.style.display = "block";
          });
        }
      } catch (error) {
        if (error.name === "AbortError") return;
        console.error("Error refetching table:", error);
      } finally {
        this._state.loading.fetchingTable = false;
        this._fetchControllers.table = null;
        this.enableColorSelectors();
      }
    }

    /**
     * Cancela el fetch actual de tabla
     */
    cancelTableFetch() {
      if (this._fetchControllers.table) {
        this._fetchControllers.table.abort();
        this._fetchControllers.table = null;
      }
    }

    /**
     * Reemplaza solo el contenido del tbody
     * @param {string} tbodyHtml - HTML nuevo del tbody
     */
    replaceTbodyContent(tbodyHtml) {
      const tbody = this.variantTable?.querySelector("tbody");
      
      if (tbody) {
        tbody.innerHTML = tbodyHtml;
      } else {
        console.error("Tbody element not found for replacement");
      }
    }

    /**
     * Actualiza todas las referencias a elementos DOM de la tabla
     * @returns {boolean} True si se actualizaron correctamente
     */
    updateTableDOMReferences() {
      if (!this.variantTable) {
        this.variantTable = this.querySelector(".variant-table");
      }

      if (!this.variantTable) {
        console.warn("variantTable no existe");
        return false;
      }

      // Buscar elementos dentro de la tabla
      this.variantRows = this.variantTable.querySelectorAll(".variant-table__row");
      this.quantityInputs = this.variantTable.querySelectorAll(".variant-table__quantity");
      this.qtyButtons = this.variantTable.querySelectorAll(".qty-input__btn");
      this.removeContainers = this.variantTable.querySelectorAll(
        ".variant-table__remove-container"
      );
      this.removeButtons = this.variantTable.querySelectorAll(".js-remove-item");
      this.viewCartButton = this.variantTable.querySelector(".variant-table__view-cart-button");
      this.subtotalValueEl = this.variantTable.querySelector(".variant-table__subtotal-value");
      this.totalItemsValueEl = this.variantTable.querySelector(
        ".variant-table__total-items-value"
      );
      this.totalsLoader = this.variantTable.querySelector(".variant-table__loader");
      this.prices = this.variantTable.querySelectorAll(".upng-price-wrapper--pvd");
      this.stockIndicators = this.variantTable.querySelectorAll(".js-stock-indicator");

      // Boton de Limpiar todo en Modal, fuera de tabla
      this.clearAllButton = document.querySelector(".variant-table__clear-button");

      // Boton de confirmacion a limpiar
      this.clearConfirm = this.variantTable.querySelector("#clear_modal_opener");      

      // Invalidar caché de indicadores de stock
      this._cache.stockIndicators = null;

      return true;
    }

    /**
     * Configura/remueve event listeners de la tabla
     * @param {boolean} attach - True para agregar, false para remover
     */
    configureTableEventListeners(attach = true) {
      const action = attach ? "addEventListener" : "removeEventListener";

      // Inputs de cantidad
      this.quantityInputs?.forEach((input) => {
        if (input.hasAttribute("data-variant-id")) {
          input[action]("change", this.boundHandleQuantityChange);
        }
        input[action]("focus", this.boundHandleInputFocus);
        input[action]("keydown", this.boundHandleInputKeydown);
        input[action]("input", this.boundUpdateLimitState);
      });

      // Botones de cantidad
      this.qtyButtons?.forEach((button) => {
        button[action]("click", this.boundHandleQuantityButtonClick);
      });

      // Botones de eliminar
      this.removeButtons?.forEach((button) => {
        button[action]("click", this.boundHandleRemoveButtonClick);
      });

      // Botón ver carrito
      if (this.viewCartButton) {
        this.viewCartButton[action]("click", this.handleViewCart.bind(this));
      }

      // Botón borrar todo
      if (this.clearAllButton) {
        this.clearAllButton[action]("click", this.handleClearAll.bind(this));
      }
    }

    /**
     * Agrega event listeners de la tabla
     */
    attachTableEventListeners() {
      this.configureTableEventListeners(true);
    }

    /**
     * Remueve event listeners de la tabla
     */
    detachTableEventListeners() {
      this.configureTableEventListeners(false);
    }

    disableColorSelectors() {
      const colorSelector = this.optionSelectors[0];
      if (colorSelector) {
        const inputs = colorSelector.querySelectorAll("input[type='radio']");
        inputs.forEach((input) => {
          input.disabled = true;
        });
      }
    }

    enableColorSelectors() {
      const colorSelector = this.optionSelectors[0];
      if (colorSelector) {
        const inputs = colorSelector.querySelectorAll("input[type='radio']");
        inputs.forEach((input) => {
          input.disabled = false;
        });
      }
    }

    /**
     * Restaura valores de pendingChanges para el color actual
     */
    restorePendingChangesForCurrentColor() {
      if (!this.quantityInputs || Object.keys(this._state.data.pendingChanges).length === 0) {
        return;
      }

      this.quantityInputs.forEach((input) => {
        const variantId = input.getAttribute("data-variant-id");

        if (this._state.data.pendingChanges.hasOwnProperty(variantId)) {
          const pendingQuantity = this._state.data.pendingChanges[variantId];
          input.value = pendingQuantity;
          this.updateLimitState(input);
          this.updateSingleStockIndicator(variantId, pendingQuantity);
        }
      });

      this.updateAddToCartButtonState();
    }

    /**
     * Actualiza el estado del botón "Limpiar todo"
     * Habilita/deshabilita según si hay items del producto en carrito
     */
    updateClearButtonState() {
      if (!this.clearConfirm) return;

      const productVariantIds = this.data.product.variants.map((variant) => variant.id);
      const cartItems = this._state.data.cartItems || [];

      // Contar items de este producto en carrito
      let totalItems = 0;
      cartItems.forEach((item) => {
        if (productVariantIds.includes(item.variant_id)) {
          totalItems += item.quantity;
        }
      });

      // Si hay items, habilitar. Si no, deshabilitar
      if (totalItems > 0) {
        this.clearConfirm.classList.remove("opener_inactive");
      } else {
        this.clearConfirm.classList.add("opener_inactive");
      }
    }

    // ============================================================================
    // FILTRO DE OUTLET
    // ============================================================================

    /**
     * Programa el filtro de outlet con debounce
     */
    scheduleOutletFilter() {
      if (this._outletFilterTimeout) {
        clearTimeout(this._outletFilterTimeout);
      }

      this._outletFilterTimeout = setTimeout(() => {
        this.filterOutletVariants();
      }, 50);
    }

    /**
     * Filtra selectores y filas según contexto outlet
     */
    filterOutletVariants() {
      const path = window.location.pathname;
      const collectionsMatch = path.match(/\/collections\/([^\/]+)/);
      const isOutlet = collectionsMatch ? collectionsMatch[1] === "outlet" : false;

      if (!isOutlet) return;

      this.filterOutletColorSelectors();

      if (this._state.flags.tableLoaded && this.variantRows?.length > 0) {
        this.filterOutletTableRows();
      }
    }

    /**
     * Filtra selectores de color para outlet
     */
    filterOutletColorSelectors() {
      const colorSelector = this.optionSelectors?.[0];
      if (!colorSelector) return;

      const colorLabels = colorSelector.querySelectorAll(".opt-label");

      colorLabels.forEach((label) => {
        const input = label.previousElementSibling;
        const colorValue = input?.value;

        if (!colorValue) return;

        const hasOutletStock = this.data.product.variants.some((variant) => {
          const isThisColor = variant.option1 === colorValue;
          const isDescatalogado = variant.metafields?.upng?.descatalogado === true;
          const hasStock = variant.inventory_quantity > 0;

          return isThisColor && isDescatalogado && hasStock;
        });

        label.style.display = hasOutletStock ? "" : "none";
      });
    }

    /**
     * Filtra filas de tabla para outlet
     */
    filterOutletTableRows() {
      this.variantRows.forEach((row) => {
        const stockIndicator = row.querySelector(".js-stock-indicator");
        if (!stockIndicator) return;

        const isDescatalogado = stockIndicator.dataset.descatalogado === "true";
        const stockShopify = parseInt(stockIndicator.dataset.stockShopify) || 0;

        const shouldShow = isDescatalogado && stockShopify > 0;
        row.style.display = shouldShow ? "" : "none";
      });
    }

    // ============================================================================
    // SINCRONIZACIÓN CON CARRITO
    // ============================================================================

    /**
     * Inicializa sincronización con carrito
     */
    async initCartSync() {
      if (!this._state.flags.tableLoaded || this._state.flags.cartSynced) return;

      document.addEventListener("on:cart:update", this.boundHandleCartUpdate);

      try {
        await this.updateFromCart();

        // Clamp de valores iniciales
        this.quantityInputs?.forEach((input) => {
          if (input.hasAttribute("max")) {
            const max = parseInt(input.max, 10);
            const current = parseInt(input.value, 10);
            if (current > max) {
              input.value = max;
            }
            this.updateLimitState(input);
          }
        });

        // Event listeners globales
        document.addEventListener("on:cart:add", this.boundHandleCartAdd);
        document.addEventListener("on:line-item:change", this.boundHandleLineItemChange);

        // Sincronizar indicadores de stock
        this.updateAllStockIndicators(this._state.data.cartItems);

        this._state.flags.cartSynced = true;
      } catch (error) {
        console.error("Error initializing cart sync:", error);
        this.cleanupCartListeners();
      }
    }

    /**
     * Limpia listeners de carrito
     */
    cleanupCartListeners() {
      document.removeEventListener("on:cart:add", this.boundHandleCartAdd);
      document.removeEventListener("on:line-item:change", this.boundHandleLineItemChange);
      // Limpiar listener de Evento
      document.removeEventListener("on:cart:update", this.boundHandleCartUpdate);
    }

    /**
     * Maneja evento on:cart:update - Sincronización COMPLETA del carrito
     */
    handleCartUpdate(event) {
      console.log('🔄 UPNG-variant-picker: Recibido evento on:cart:update');
      
      const { cart } = event.detail;
      
      if (!cart || !Array.isArray(cart.items)) {
        console.warn('on:cart:update recibido sin datos válidos:', cart);
        return;
      }

      this._state.data.cartItems = cart.items;
      this.updateQuantityInputs(cart.items);
      this.updateTableTotals(cart.items);
      this.updateAllStockIndicators(cart.items);
      this.clearPendingChanges();
      this.updateAddToCartButtonState();
      this.updateClearButtonState();
      
      console.log('✅ UPNG-variant-picker sincronizado con carrito actualizado');
    }

    /**
     * Obtiene estado actual del carrito
     */
    async updateFromCart() {
      try {
        const response = await fetch("/cart.js");

        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const cart = await response.json();

        if (cart && cart.items) {
          this._state.data.cartItems = cart.items;
          this.updateQuantityInputs(cart.items);
          this.updateTableTotals(cart.items);
          this.clearPendingChanges();
          this.updateAddToCartButtonState();
        }
      } catch (error) {
        console.error("Error fetching cart:", error);
      }
    }

    handleCartAdd(event) {
      const { cart } = event.detail;
      this.updateQuantityInputsRespectingPending(cart.items);
    }

    handleLineItemChange(event) {
      const { cart } = event.detail;
      this.updateQuantityInputsRespectingPending(cart.items);
    }

    /**
     * Actualiza inputs de cantidad con datos del carrito
     * @param {Array} cartItems - Items del carrito
     */
    updateQuantityInputs(cartItems) {
      if (!this.quantityInputs) return;

      this._state.data.cartItems = cartItems;

      this.quantityInputs.forEach((input) => {
        const variantId = input.getAttribute("data-variant-id");
        const cartItem = cartItems.find((item) => item.variant_id === parseInt(variantId));
        const newQuantity = cartItem ? cartItem.quantity : 0;

        if (input.value != newQuantity) {
          input.value = newQuantity;
          this.updateLimitState(input);
        }
      });

      this.updateRemoveButtonsVisibility(cartItems);
      this.updateTableTotals(cartItems);
    }

    /**
     * Actualiza inputs respetando cambios pendientes
     * @param {Array} cartItems - Items del carrito
     */
    updateQuantityInputsRespectingPending(cartItems) {
      if (!this.quantityInputs) return;

      this._state.data.cartItems = cartItems;

      this.quantityInputs.forEach((input) => {
        const variantId = input.getAttribute("data-variant-id");

        let newQuantity;
        if (this._state.data.pendingChanges.hasOwnProperty(variantId)) {
          newQuantity = this._state.data.pendingChanges[variantId];
        } else {
          const cartItem = cartItems.find((item) => item.variant_id === parseInt(variantId));
          newQuantity = cartItem ? cartItem.quantity : 0;
        }

        if (input.value != newQuantity) {
          input.value = newQuantity;
          this.updateLimitState(input);
        }
      });

      const simulatedItems = this.getSimulatedCartItems();
      this.updateRemoveButtonsVisibility(simulatedItems);
      this.updateTableTotals(simulatedItems);
    }

    // ============================================================================
    // CAMBIOS PENDIENTES (Pending Changes)
    // ============================================================================

    /**
     * Actualiza el objeto de cambios pendientes
     * @param {string} variantId - ID de la variante
     * @param {number} newQuantity - Nueva cantidad
     */
    updatePendingChange(variantId, newQuantity) {
      const currentCartItem = this._state.data.cartItems?.find(
        (item) => item.variant_id == variantId
      );
      const currentQuantity = currentCartItem ? currentCartItem.quantity : 0;

      if (newQuantity === currentQuantity) {
        delete this._state.data.pendingChanges[variantId];
      } else {
        this._state.data.pendingChanges[variantId] = newQuantity;
      }
    }

    /**
     * Retorna simulación del carrito con cambios pendientes
     * @returns {Array} Items simulados
     */
    getSimulatedCartItems() {
      const simulatedItems = this._state.data.cartItems ? [...this._state.data.cartItems] : [];

      Object.keys(this._state.data.pendingChanges).forEach((variantId) => {
        const newQuantity = this._state.data.pendingChanges[variantId];
        const existingItemIndex = simulatedItems.findIndex(
          (item) => item.variant_id == variantId
        );

        if (existingItemIndex !== -1) {
          if (newQuantity === 0) {
            simulatedItems.splice(existingItemIndex, 1);
          } else {
            simulatedItems[existingItemIndex].quantity = newQuantity;
          }
        } else if (newQuantity > 0) {
          simulatedItems.push({
            variant_id: parseInt(variantId),
            quantity: newQuantity,
          });
        }
      });

      return simulatedItems;
    }

    /**
     * Verifica si hay cambios pendientes
     * @returns {boolean}
     */
    hasPendingChanges() {
      return Object.keys(this._state.data.pendingChanges).length > 0;
    }

    /**
     * Limpia todos los cambios pendientes
     */
    clearPendingChanges() {
      this._state.data.pendingChanges = {};
    }

    // ============================================================================
    // BOTÓN "ACTUALIZAR CARRITO"
    // ============================================================================

    /**
     * Inicializa el botón de agregar/actualizar carrito
     */
    initAddToCartButton() {
      this.addToCartBtn = this.querySelector(".js-actualizar-carrito");

      if (!this.addToCartBtn) return;

      this.boundHandleAddToCartClick = this.handleAddToCartClick.bind(this);
      this.addToCartBtn.addEventListener("click", this.boundHandleAddToCartClick);

      this.updateAddToCartButtonState();
    }

    /**
     * Actualiza estado del botón según cambios pendientes
     */
    updateAddToCartButtonState() {
      if (!this.addToCartBtn) return;

      const hasPending = this.hasPendingChanges();
      const hasItemsInCart = this._state.data.cartItems?.some((item) => {
        const productVariantIds = this.data.product.variants.map((v) => v.id);
        return productVariantIds.includes(item.variant_id);
      });

      if (hasItemsInCart) {
        this.addToCartBtn.textContent = theme.strings.variantTable.cartUpdate || "UPDATE CART";
      } else {
        this.addToCartBtn.textContent = theme.strings.variantTable.cartAdd || "ADD TO CART";
      }

      this.addToCartBtn.disabled = !hasPending;
    }

    /**
     * Maneja click en botón de actualizar carrito
     * @param {Event} event
     */
    async handleAddToCartClick(event) {
      event.preventDefault();

      if (this._state.loading.updating || !this.hasPendingChanges()) return;

      this.enableLoader();

      try {
        this._state.loading.updating = true;

        const changes = { ...this._state.data.pendingChanges };
        const updates = {};

        for (const [variantId, newQuantity] of Object.entries(changes)) {
          updates[variantId] = newQuantity;
        }

        const response = await fetch("/cart/update.js", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ updates }),
        });

        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const updatedCart = await response.json();

        if (updatedCart && updatedCart.items) {
          this._state.data.cartItems = updatedCart.items;
          this.updateQuantityInputs(updatedCart.items);
          this.updateTableTotals(updatedCart.items);
          this.clearPendingChanges();
          this.updateAddToCartButtonState();

          document.dispatchEvent(
            new CustomEvent("dispatch:cart-drawer:refresh", {
              bubbles: true,
            })
          );

          await this.updateCartIconBubble();

          document.dispatchEvent(
            new CustomEvent("on:cart:update", {
              detail: { cart: updatedCart },
              bubbles: true,
            })
          );
        }
      } catch (error) {
        console.error("Error updating cart:", error);

        document.dispatchEvent(
          new CustomEvent("on:cart:error", {
            detail: { error: error.message },
            bubbles: true,
          })
        );

        await this.updateFromCart();
        this.clearPendingChanges();
        this.updateAddToCartButtonState();
      } finally {
        this._state.loading.updating = false;
        this.disableAllLoaders();
      }
    }

    // ============================================================================
    // HANDLERS DE INPUTS DE CANTIDAD
    // ============================================================================

    /**
     * Maneja cambios en inputs de cantidad
     * @param {Event} event
     */
    handleQuantityChange(event) {
      if (this._state.loading.updating) return;

      const input = event.target;
      const variantId = input.getAttribute("data-variant-id");
      let newQuantity = parseInt(input.value);

      if (!variantId) return;

      // Validar límite máximo
      if (input.hasAttribute("max")) {
        const maxQuantity = parseInt(input.max, 10);
        if (newQuantity > maxQuantity) {
          newQuantity = maxQuantity;
          input.value = maxQuantity;
          this.updateLimitState(input);
        }
      }

      this.updatePendingChange(variantId, newQuantity);
      this.updateSingleStockIndicator(variantId, newQuantity);
      this.updateAddToCartButtonState();
    }

    /**
     * Maneja clicks en botones de incremento/decremento
     * @param {Event} event
     */
    handleQuantityButtonClick(event) {
      if (!event.target.matches(".qty-input__btn")) return;
      event.preventDefault();

      const qtyContainer = event.target.closest(".qty-input");
      const input = qtyContainer.querySelector(".variant-table__quantity");
      const currentQty = input.value;

      if (event.target.name === "plus") {
        input.stepUp();
      } else {
        input.stepDown();
      }

      this.updateLimitState(input);

      if (input.value !== currentQty) {
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    handleInputFocus(event) {
      if (window.matchMedia("(pointer: fine)").matches) {
        event.target.select();
      }
    }

    handleInputKeydown(event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      event.target.blur();
      event.target.focus();
    }

    /**
     * Actualiza estado visual del límite de cantidad
     * @param {HTMLInputElement} input
     */
    updateLimitState(input) {
      if (!input.hasAttribute("max")) return;

      const max = parseInt(input.max, 10);
      const value = parseInt(input.value, 10);
      const wrapper = input.closest(".qty-input--combined");
      if (!wrapper) return;

      wrapper.classList.remove("at-limit", "over-limit");

      if (value > max) {
        wrapper.classList.add("over-limit");
      } else if (value === max) {
        wrapper.classList.add("at-limit");
      }
    }

    // ============================================================================
    // BOTONES DE ACCIÓN (Eliminar, Clear All, Ver Carrito)
    // ============================================================================

    /**
     * Actualiza visibilidad de botones de eliminar
     * @param {Array} cartItems
     */
    updateRemoveButtonsVisibility(cartItems) {
      if (!this.removeButtons || !this.removeButtons.length) return;

      this.removeButtons.forEach((button) => {
        const row = button.closest(".variant-table__row");
        if (!row) return;

        const container = button.closest(".variant-table__remove-container");
        if (!container) return;

        const variantId = parseInt(row.getAttribute("data-variant-row"));
        if (!variantId) return;

        const variantInCart = cartItems.some(
          (item) => item.variant_id === variantId && item.quantity > 0
        );

        container.classList.toggle("hidden", !variantInCart);
        button.setAttribute("data-variant-id", variantId);
      });
    }

    /**
     * Maneja click en botón de eliminar línea
     * @param {Event} event
     */
    handleRemoveButtonClick(event) {
      event.preventDefault();

      if (this._state.loading.updating) return;

      const button = event.currentTarget;
      const variantId = button.getAttribute("data-variant-id");

      if (!variantId) return;

      this.updatePendingChange(variantId, 0);

      const container = button.closest(".variant-table__remove-container");
      if (container) {
        container.classList.add("hidden");
      }

      const row = button.closest(".variant-table__row");
      if (row) {
        const input = row.querySelector(".variant-table__quantity");
        if (input) {
          input.value = 0;
          this.updateLimitState(input);
        }
      }

      this.updateSingleStockIndicator(variantId, 0);
      this.updateAddToCartButtonState();
    }

    /**
     * Maneja click en "Borrar Todo"
     * @param {Event} event
     */
    async handleClearAll(event) {
      event.preventDefault();

      if (this._state.loading.updating) return;

      try {
        this._state.loading.updating = true;

        const productVariantIds = this.data.product.variants.map((variant) => variant.id);

        if (productVariantIds.length === 0) return;

        const cartResponse = await fetch("/cart.js");
        const cart = await cartResponse.json();

        const updates = {};

        cart.items.forEach((item) => {
          if (productVariantIds.includes(item.variant_id)) {
            updates[item.id] = 0;
          }
        });

        if (Object.keys(updates).length === 0) return;

        const response = await fetch("/cart/update.js", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ updates }),
        });

        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const updatedCart = await response.json();

        this.updateQuantityInputs(updatedCart.items);

        this.quantityInputs.forEach((input) => {
          const inputVariantId = input.getAttribute("data-variant-id");
          if (productVariantIds.includes(parseInt(inputVariantId))) {
            this.updateLimitState(input);
          }
        });

        this.updateAllStockIndicators(updatedCart.items);

        document.dispatchEvent(
          new CustomEvent("dispatch:cart-drawer:refresh", {
            bubbles: true,
          })
        );

        await this.updateCartIconBubble();
      } catch (error) {
        console.error("Error clearing items:", error);
        document.dispatchEvent(
          new CustomEvent("on:cart:error", {
            detail: { error: error.message },
            bubbles: true,
          })
        );
      } finally {
        this._state.loading.updating = false;
        this.disableAllLoaders();
      }
    }

    handleViewCart(event) {
      return; // Enlace directo a /cart
    }

    // ============================================================================
    // INDICADORES DE STOCK
    // ============================================================================

    /**
     * Busca el indicador de stock para una variante
     * MÉTODO UTILITARIO - Elimina duplicación
     * @param {string|number} variantId - ID de la variante
     * @returns {HTMLElement|null}
     */
    findStockIndicator(variantId) {
      const id = String(variantId);

      // Buscar por data-variant-row
      let indicator = this.variantTable?.querySelector(
        `[data-variant-row="${id}"] .js-stock-indicator`
      );

      if (indicator) return indicator;

      // Fallback: buscar por input
      const input =
        this.variantTable?.querySelector(
          `.variant-table__quantity[data-variant-id="${id}"]`
        ) || this.querySelector(`.variant-table__quantity[data-variant-id="${id}"]`);

      if (input) {
        const cell = input.closest(".variant-table__cell");
        indicator = cell?.querySelector(".js-stock-indicator");
      }

      return indicator;
    }

    /**
     * Obtiene el variant ID desde un indicador de stock
     * @param {HTMLElement} indicator
     * @returns {string|null}
     */
    getVariantIdFromIndicator(indicator) {
      const row = indicator.closest("[data-variant-row]");
      if (row) return row.dataset.variantRow;

      const cell = indicator.closest(".variant-table__cell");
      const input = cell?.querySelector(".variant-table__quantity[data-variant-id]");
      return input?.dataset.variantId || null;
    }

    /**
     * Actualiza TODOS los indicadores de stock
     * @param {Array} cartItems
     */
    updateAllStockIndicators(cartItems = null) {
      const items = cartItems || this._state.data.cartItems || [];
      const stockIndicators = this.querySelectorAll(".js-stock-indicator");

      stockIndicators.forEach((indicator) => {
        const variantId = this.getVariantIdFromIndicator(indicator);
        if (!variantId) return;

        const cartItem = items.find((item) => item.variant_id == variantId);
        const quantity = cartItem ? cartItem.quantity : 0;

        indicator.dataset.quantity = quantity;
        this.updateStockDisplay(indicator, quantity);
      });
    }

    /**
     * Actualiza indicador de stock de UNA variante
     * @param {string} variantId
     * @param {number} newQuantity
     */
    updateSingleStockIndicator(variantId, newQuantity) {
      const indicator = this.findStockIndicator(variantId);

      if (!indicator) return;

      this.updateStockDisplay(indicator, newQuantity);
    }

    /**
     * Actualiza la visualización de un indicador de stock
     * @param {HTMLElement} indicator
     * @param {number} cartQuantity
     */
    async updateStockDisplay(indicator, cartQuantity) {
      const stockShopify = parseInt(indicator.dataset.stockShopify) || 0;
      const stockDisponible = parseInt(indicator.dataset.stockDisponible) || 0;
      const descatalogado = indicator.dataset.descatalogado === "true";
      const id_erp = indicator.dataset.id_erp;

      console.log(id_erp);
      

      const availableText = window.translations?.availableText || "Disponibles";
      const backorderText = window.translations?.backorderText || "en 2 días";
      const remainingText = window.translations?.remainingText || "Restante";
      const askText = window.translations?.askText || "Contáctanos";

      const stockMostrar = stockShopify > 10 ? "+10" : stockShopify.toString();

      // Determinar estilo del indicador
      if (descatalogado) {
        indicator.dataset.inventoryLevel = stockShopify === 0 ? "very_low" : "low";
      } else {
        indicator.dataset.inventoryLevel = stockShopify <= 0 ? "backordered" : "normal";
      }

      // Mostrar stock simple o complejo
      if (cartQuantity <= stockShopify) {
        indicator.textContent = stockMostrar;
      } else {
        const mensajes = [];

        mensajes.push(`${stockShopify} ${availableText}`);

        if (stockDisponible !== 0) {
          mensajes.push(`${stockDisponible} ${backorderText}`);
        }

        if (!descatalogado && id_erp && typeof getDateStock === "function") {
          try {
            const dateStock = await getDateStock(id_erp, cartQuantity);

            if (dateStock.status === "success" && dateStock.date) {
              mensajes.push(`${remainingText} ${dateStock.date}`);
            } else {
              mensajes.push(`${remainingText} ${askText}`);
            }
          } catch (error) {
            mensajes.push(`${remainingText} ${askText}`);
          }
        }

        indicator.innerHTML = mensajes.join("<br>");
      }
    }

    // ============================================================================
    // TOTALES DE TABLA
    // ============================================================================

    /**
     * Actualiza totales de la tabla
     * @param {Array} cartItems
     */
    updateTableTotals(cartItems) {
      // Si estamos en medio de un cambio de variante, no actualizar totales
      if (!this._state.flags.tableLoaded) return;

      if (!this.subtotalValueEl || !this.totalItemsValueEl || !this._state.flags.tableLoaded)
        return;

      const productVariantIds = this.data.product.variants.map((variant) => variant.id);

      let totalItems = 0;
      let subtotal = 0;

      cartItems.forEach((item) => {
        if (productVariantIds.includes(item.variant_id)) {
          totalItems += item.quantity;
          subtotal += item.final_line_price;
        }
      });

      this.totalItemsValueEl.innerHTML = `<strong>${totalItems}</strong>`;
      this.subtotalValueEl.innerHTML = `<strong>${this.formatMoney(subtotal)} €</strong>`;

      // Actualizar estado del botón limpiar
      this.updateClearButtonState();
    }

    /**
     * Formatea dinero
     * @param {number} cents
     * @returns {string}
     */
    formatMoney(cents) {
      if (typeof window.theme === "undefined" || !window.theme.moneyFormat) {
        return `${(cents / 100).toFixed(2).replace(".", ",")}`;
      }

      let amount = (cents / 100).toFixed(2);
      amount = amount.replace(".", ",");

      return window.theme.moneyFormat.replace(/{{amount}}/g, amount).replace(" €", "");
    }

    // ============================================================================
    // LOADERS Y UI
    // ============================================================================

    enableLoader() {
      if (!this._state.flags.tableLoaded) return;

      if (this.totalsLoader) {
        this.totalsLoader.classList.remove("hidden");
      }

      if (this.variantTable) {
        this.variantTable.classList.add("pointer-events-none");
      }

      if (document.activeElement) {
        document.activeElement.blur();
      }
    }

    disableAllLoaders() {
      if (!this._state.flags.tableLoaded) return;

      if (this.totalsLoader) {
        this.totalsLoader.classList.add("hidden");
      }

      if (this.variantTable) {
        this.variantTable.classList.remove("pointer-events-none");
      }
    }

    /**
     * Actualiza el ícono del carrito en header
     */
    async updateCartIconBubble() {
      try {
        const response = await fetch("/?sections=cart-icon-bubble");
        if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);

        const data = await response.json();

        if (!data || !data["cart-icon-bubble"]) {
          throw new Error("Missing cart-icon-bubble section in response");
        }

        const cartIconBubble = document.getElementById("cart-icon-bubble");
        if (cartIconBubble) {
          cartIconBubble.innerHTML = data["cart-icon-bubble"];
        }
      } catch (error) {
        console.error("Error updating cart icon:", error);
      }
    }

    // ============================================================================
    // OPTIMIZACIONES - ÍNDICE DE VARIANTES
    // ============================================================================

    /**
     * Obtiene o construye el índice de variantes
     * OPTIMIZACIÓN: Reduce O(n²) a O(n) en updateAvailability
     * @returns {Object} Índice con byOption y byId
     */
    getVariantIndex() {
      if (this._cache.variantIndex) {
        return this._cache.variantIndex;
      }

      this._cache.variantIndex = {
        byOption: new Map(),
        byId: new Map(),
      };

      this.data.product.variants.forEach((variant) => {
        this._cache.variantIndex.byId.set(variant.id, variant);

        variant.options.forEach((optionValue, optionIndex) => {
          const key = `${optionIndex}-${optionValue}`;

          if (!this._cache.variantIndex.byOption.has(key)) {
            this._cache.variantIndex.byOption.set(key, []);
          }

          this._cache.variantIndex.byOption.get(key).push(variant);
        });
      });

      return this._cache.variantIndex;
    }

    /**
     * Encuentra variantes que coinciden con opciones dadas
     * @param {Array} selectedOptions
     * @param {number} excludeIndex
     * @param {Object} index
     * @returns {Array}
     */
    findMatchingVariants(selectedOptions, excludeIndex, index) {
      const searchKeys = [];

      selectedOptions.forEach((optionValue, optionIndex) => {
        if (optionIndex !== excludeIndex && optionValue !== null) {
          searchKeys.push(`${optionIndex}-${optionValue}`);
        }
      });

      if (searchKeys.length === 0) {
        return Array.from(index.byId.values());
      }

      const candidates = index.byOption.get(searchKeys[0]) || [];

      return candidates.filter((variant) => {
        return searchKeys.every((key) => {
          const [optionIndex, optionValue] = key.split("-");
          return variant.options[parseInt(optionIndex)] === optionValue;
        });
      });
    }

    /**
     * Invalida todos los cachés
     */
    invalidateCache() {
      this._cache.variantIndex = null;
      this._cache.stockIndicators = null;
    }

    // ============================================================================
    // LIFECYCLE - CLEANUP
    // ============================================================================

    /**
     * Cleanup al desconectar el componente
     */
    disconnectedCallback() {
      // Cancelar fetches pendientes
      this.cancelTableFetch();

      // Limpiar timeouts
      if (this._outletFilterTimeout) {
        clearTimeout(this._outletFilterTimeout);
        this._outletFilterTimeout = null;
      }

      // Limpiar promesas
      this._graphqlPromise = null;

      // Limpiar cachés
      this.invalidateCache();

      // Limpiar listeners de carrito
      this.cleanupCartListeners();

      // Limpiar listeners de tabla
      this.detachTableEventListeners();

      // Limpiar botón de actualizar carrito
      if (this.addToCartBtn && this.boundHandleAddToCartClick) {
        this.addToCartBtn.removeEventListener("click", this.boundHandleAddToCartClick);
      }
    }
  }

  customElements.define("upng-variant-picker", VariantPicker);
}