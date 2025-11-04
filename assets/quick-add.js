/* global SideDrawer */

const DOMAIN = "garys-b2benterprise.myshopify.com";
const STOREFRONT_ACCESS_TOKEN = "a12948ac9a26fdb704467b281c0d3217";

if (!customElements.get("quick-add-drawer")) {
  class QuickAddDrawer extends SideDrawer {
    constructor() {
      super();
      this.content = this.querySelector(".js-product-details");
      this.footer = this.querySelector(".drawer__footer");
      this.form = this.querySelector("product-form");
      this.notification = this.querySelector(".js-added-to-cart");
      this.backBtn = this.querySelector(".drawer__back-btn");
      this.openCartDrawerLinks = this.querySelectorAll(".js-open-cart-drawer");
      this.cartDrawer = document.querySelector("cart-drawer");
      this.fetch = null;
      this.fetchedUrls = [];

      // NUEVO: Estado interno
      this._state = {
        isUpdating: false,
        isTableLoaded: false,
        isCartSynced: false,
        pendingChanges: {}, // { variantId: newQuantity }
      };

      this.quickAddButtonMouseEnterHandler =
        this.handleQuickAddButtonMouseEnter.bind(this);
      this.documentClickHandler = this.handleDocumentClick.bind(this);

      // NUEVO: Bindings para eventos del carrito
      this.boundHandleCartAdd = this.handleCartAdd.bind(this);
      this.boundHandleLineItemChange = this.handleLineItemChange.bind(this);
      this.boundHandleQuantityChange = this.handleQuantityInputChange.bind(this);

      document.addEventListener("click", this.documentClickHandler);
      this.addEventListener(
        "on:variant:change",
        this.handleVariantChange.bind(this)
      );

      this.openCartDrawerLinks.forEach((link) => {
        link.addEventListener("click", this.handleOpenCartClick.bind(this));
      });

      if (theme.device.hasHover && theme.mediaMatches.md) {
        document.querySelectorAll(".js-quick-add").forEach((button) => {
          this.bindQuickAddButtonMouseEnter(button);
        });

        if ("MutationObserver" in window) {
          this.observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              // Agregar event listener a nuevos botones
              mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  node.querySelectorAll(".js-quick-add").forEach((button) => {
                    this.bindQuickAddButtonMouseEnter(button);
                  });
                }
              });

              // Remover event listener de botones eliminados
              mutation.removedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  node.querySelectorAll(".js-quick-add").forEach((button) => {
                    button.removeEventListener(
                      "mouseenter",
                      this.quickAddButtonMouseEnterHandler
                    );
                  });
                }
              });
            });
          });

          // Comenzar a observar cambios en el DOM
          this.observer.observe(document.body, {
            childList: true,
            subtree: true,
          });
        }
      }
    }

    /**
     * Obtiene todas las variantes de un producto específico usando GraphQL
     * @param {string} productHandle - Handle del producto en Shopify
     * @returns {Promise<Object>} Objeto con datos del producto y sus variantes
     * @throws {Error} Si hay errores en la consulta o el producto no existe
     */
    async fetchAllVariants(productHandle) {
      try {
        let hasNextPage = true;
        let cursor = null;
        let allVariants = [];
        let productData = null;

        // Verificar que tenemos las constantes necesarias
        if (
          typeof DOMAIN === "undefined" ||
          typeof STOREFRONT_ACCESS_TOKEN === "undefined"
        ) {
          throw new Error(
            "DOMAIN y STOREFRONT_ACCESS_TOKEN deben estar definidos"
          );
        }

        while (hasNextPage) {
          const query = `
            query getProductVariants($handle: String!, $cursor: String) {
              product(handle: $handle) {
                id
                title
                handle
                media(first: 250) {
                  edges {
                    node {
                      mediaContentType
                      ...on MediaImage {
                        image {
                          url
                          altText
                        }
                      }
                    }
                  }
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
                      availableForSale
                      quantityAvailable
                      price {
                        amount
                        currencyCode
                      }
                      selectedOptions {
                        name
                        value
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
            cursor,
          };

          const response = await fetch(
            `https://${DOMAIN}/api/2024-07/graphql.json`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Storefront-Access-Token": STOREFRONT_ACCESS_TOKEN,
              },
              body: JSON.stringify({ query, variables }),
            }
          );

          const result = await response.json();

          // Verificar si hay errores en la respuesta
          if (result.errors) {
            console.error("Error en GraphQL:", result.errors);
            throw new Error("Error en la consulta GraphQL");
          }

          const product = result.data?.product;
          if (!product) {
            throw new Error(
              `Producto con handle "${productHandle}" no encontrado`
            );
          }

          // Guardar datos del producto en la primera iteración
          if (!productData) {
            productData = {
              id: product.id,
              title: product.title,
              handle: product.handle,
              featuredImage: product.featuredImage,
              options: product.options,
              media: product.media,
            };
          }

          const edges = product.variants?.edges || [];

          // Agregar variantes al array
          edges.forEach((edge) => {
            allVariants.push(edge.node);
          });

          hasNextPage = product.variants?.pageInfo?.hasNextPage || false;
          cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
        }

        return {
          product: productData,
          variants: allVariants,
        };
      } catch (error) {
        console.error("Error fatal en fetchAllVariants:", error);
        throw error;
      }
    }

    /**
     * Extrae el código de color de una cadena con formato "CODIGO - NOMBRE"
     * @param {string} colorString - Cadena de texto con el color (ej: "753 - Azul")
     * @returns {string} Código extraído sin espacios (ej: "753")
     */
    extractColorCode(colorString) {
      if (!colorString) return "";

      // Buscar el patrón "CODIGO - NOMBRE" (antes del ' - ')
      const match = colorString.match(/^(\d+)\s*-/);

      return match ? match[1] : "";
    }

    /**
     * Extrae el ID numérico de una variante desde el formato GID de Shopify
     * @param {string|number} variantIdentifier - ID en formato "gid://shopify/ProductVariant/123456" o ya numérico
     * @returns {string} ID numérico de la variante (ej: "123456")
     * @throws {Error} Si el formato del GID es inválido
     *
     * @example
     * extractVariantId("gid://shopify/ProductVariant/123456") // "123456"
     * extractVariantId(123456) // "123456"
     * extractVariantId("123456") // "123456"
     */
    extractVariantId(variantIdentifier) {
      // Si ya es un número o string numérico, devolverlo como string
      if (typeof variantIdentifier === "number") {
        return variantIdentifier.toString();
      }

      const identifier = String(variantIdentifier);

      // Si ya es numérico (sin prefijo GID), devolverlo
      if (/^\d+$/.test(identifier)) {
        return identifier;
      }

      // Extraer ID del formato GID de Shopify
      const GID_PREFIX = "gid://shopify/ProductVariant/";

      if (identifier.startsWith(GID_PREFIX)) {
        const numericId = identifier.replace(GID_PREFIX, "");

        // Validar que el resultado sea numérico
        if (!/^\d+$/.test(numericId)) {
          console.error(
            `ID de variante inválido extraído: ${numericId} de ${identifier}`
          );
          throw new Error(`Formato de GID inválido: ${identifier}`);
        }

        return numericId;
      }

      // Si no coincide con ningún formato esperado
      console.error(
        `Formato de identificador de variante desconocido: ${identifier}`
      );
      throw new Error(
        `Formato de identificador de variante inválido: ${identifier}`
      );
    }

    /**
     * Construye un mapa de código de color → URL de imagen
     * @param {Object} mediaData - Datos de media del producto desde GraphQL
     * @returns {Object} Mapa con códigos de color como keys y URLs como values
     * Ejemplo: { "753": "url", "835": "url", "default": "url_primera_imagen" }
     */
    buildImageMap(mediaData) {
      const imageMap = {};
      let firstImageUrl = null;

      if (!mediaData || !mediaData.edges) {
        console.warn("No hay datos de media disponibles");
        return imageMap;
      }

      mediaData.edges.forEach((edge) => {
        const node = edge.node;

        // Verificar si tiene imagen (independiente del mediaContentType)
        if (node.image && node.image.url) {
          const imageUrl = node.image.url;

          // Guardar la primera imagen como fallback
          if (!firstImageUrl) {
            firstImageUrl = imageUrl;
          }

          // Extraer filename de la URL
          const urlParts = imageUrl.split("/");
          const filename = urlParts[urlParts.length - 1].split("?")[0]; // Remover query params

          // Buscar código entre guiones: -(\d+)-
          const match = filename.match(/-(\d+)-/);

          if (match) {
            const code = match[1];

            // Solo guardar la primera ocurrencia de cada código
            if (!imageMap[code]) {
              imageMap[code] = imageUrl;
            }
          }
        }
      });

      // Agregar imagen por defecto
      if (firstImageUrl) {
        imageMap["default"] = firstImageUrl;
      }

      return imageMap;
    }

    // ============================================================================
    // MÉTODOS NUEVOS - SISTEMA PENDING CHANGES
    // ============================================================================

    /**
     * Actualiza el objeto de cambios pendientes
     * @param {string} variantId - ID de la variante
     * @param {number} newQuantity - Nueva cantidad
     */
    updatePendingChange(variantId, newQuantity) {
      // Obtener cantidad actual del carrito
      const currentCartItem = this.cartItems?.find(
        (item) => item.variant_id == variantId
      );
      const currentQuantity = currentCartItem ? currentCartItem.quantity : 0;

      // Si la nueva cantidad es igual a la actual del carrito, remover del pending
      if (newQuantity === currentQuantity) {
        delete this._state.pendingChanges[variantId];
      } else {
        // Guardar el cambio pendiente
        this._state.pendingChanges[variantId] = newQuantity;
      }

      console.log("Pending changes:", this._state.pendingChanges);
    }

    /**
     * Retorna una simulación del carrito con los cambios pendientes aplicados
     * @returns {Array} Array de items simulados
     */
    getSimulatedCartItems() {
      // Clonar el carrito actual
      const simulatedItems = this.cartItems ? [...this.cartItems] : [];

      // Aplicar cambios pendientes
      Object.keys(this._state.pendingChanges).forEach((variantId) => {
        const newQuantity = this._state.pendingChanges[variantId];
        const existingItemIndex = simulatedItems.findIndex(
          (item) => item.variant_id == variantId
        );

        if (existingItemIndex !== -1) {
          // Item existe: actualizar cantidad
          if (newQuantity === 0) {
            // Remover del array si la cantidad es 0
            simulatedItems.splice(existingItemIndex, 1);
          } else {
            simulatedItems[existingItemIndex].quantity = newQuantity;
          }
        } else if (newQuantity > 0) {
          // Item no existe: agregarlo como nuevo
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
     * @returns {boolean} True si hay cambios pendientes
     */
    hasPendingChanges() {
      return Object.keys(this._state.pendingChanges).length > 0;
    }

    /**
     * Limpia todos los cambios pendientes
     */
    clearPendingChanges() {
      this._state.pendingChanges = {};
    }

    /**
     * Formatea el precio con el símbolo de moneda según el código
     * @param {Object} price - Objeto con amount y currencyCode
     * @returns {string} Precio formateado (ej: "27,81 €" o "$27.81")
     */
    formatPrice(price) {
      // PENDIENTE: Mejorar Lógica para otras monedas
      if (!price || !price.amount) return "";

      const amount = parseFloat(price.amount);
      const currencyCode = price.currencyCode || "EUR";

      // Símbolos de moneda comunes
      const currencySymbols = {
        EUR: "€",
        USD: "$",
        GBP: "£",
      };

      const symbol = currencySymbols[currencyCode] || currencyCode;

      // Formatear con 2 decimales y coma europea
      const formattedAmount = amount.toFixed(2).replace(".", ",");

      // EUR va después, otros antes (generalización)
      if (currencyCode === "EUR") {
        return `${formattedAmount} ${symbol}`;
      } else {
        return `${symbol}${formattedAmount}`;
      }
    }

    /**
     * Construye el HTML del componente de precio
     * @param {Object} variant - Datos de la variante desde GraphQL
     * @param {boolean} canSeePrices - Indica si el cliente puede ver precios
     * @returns {string} HTML del precio o cadena vacía si no puede verlo
     */
    buildPriceHTML(variant, canSeePrices) {
      // Si no puede ver precios, retornar vacío
      if (!canSeePrices) {
        return "";
      }

      const priceFormatted = this.formatPrice(variant.price);

      return `
    <div class="price upng-price-wrapper--pvd">
      <div class="price__default">
        <strong class="price__current upng-price-pvr">${priceFormatted}</strong>
      </div>
    </div>
  `;
    }

    /**
     * Construye el HTML del indicador de stock para una variante
     * @param {Object} variant - Datos de la variante desde GraphQL
     * @param {boolean} descatalogado - Indica si la variante está descatalogada
     * @param {boolean} canSeeStock - Indica si puede ver stock
     * @returns {string} HTML del indicador de stock
     */
    buildStockIndicator(variant, descatalogado, canSeeStock) {
      // Si no puede ver precios, ocultar el indicador
      if (!canSeeStock) {
        return '<div class="product-inventory__status" hidden></div>';
      }

      // Asegurar que stockShopify nunca sea menor a 0
      const stockShopify = Math.max(0, variant.quantityAvailable || 0);
      const stockDisponible = variant.stockDisponible?.value || "";
      const idErp = variant.idErp?.value || "";

      return `
    <div class="text-xs text-start product-inventory__status js-stock-indicator"
         data-quantity="${stockShopify}"
         data-stock-shopify="${stockShopify}"
         data-stock-disponible="${stockDisponible}"
         data-inventory-level=""
         data-descatalogado="${descatalogado}"
         data-id_erp="${idErp}">
    </div>
  `;
    }

    /**
     * Obtiene el estado actual del carrito desde Shopify
     * @returns {Promise<Object|null>} Objeto del carrito con items y metadatos, o null si falla
     * @throws {Error} Solo en casos críticos que necesiten propagarse
     *
     * @example
     * const cart = await this.fetchCart();
     * if (cart) {
     *   console.log(cart.items);
     *   console.log(cart.item_count);
     * }
     */
    async fetchCart() {
      try {
        const response = await fetch("/cart.js", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          console.error(
            `Error obteniendo carrito: HTTP ${response.status} ${response.statusText}`
          );
          return null;
        }

        const cart = await response.json();

        // Validar estructura básica del carrito
        if (!cart || typeof cart !== "object") {
          console.error("Respuesta de carrito inválida: no es un objeto", cart);
          return null;
        }

        // El carrito siempre debe tener un array de items (puede estar vacío)
        if (!Array.isArray(cart.items)) {
          console.error(
            "Respuesta de carrito inválida: items no es un array",
            cart
          );
          return null;
        }

        return cart;
      } catch (error) {
        console.error("Error fatal obteniendo carrito:", error);

        // Mostrar notificación al usuario si hay un manejador global
        if (document) {
          document.dispatchEvent(
            new CustomEvent("on:cart:error", {
              detail: {
                error: error.message,
                context: "fetchCart",
              },
              bubbles: true,
            })
          );
        }

        return null;
      }
    }

    // ========================================================================================================================
    // CONSTRUCCION DE TABLA COMPACTA DE VARIANTES
    // ========================================================================================================================

    /**
     * Construye la tabla de variantes compacta usando datos obtenidos de GraphQL
     * @param {Object} productData - Datos del producto y variantes obtenidos de fetchAllVariants()
     * @returns {string} HTML completo de la tabla de variantes
     */
    buildTablaCompacta(productData) {
      // Leer permisos del cliente desde data attributes del contenedor
      const productDetailsContainer =
        this.content.querySelector(".js-product-details") || this.content;
      const canOrder = productDetailsContainer.dataset.canOrder === "true";
      const isB2B = productDetailsContainer.dataset.isB2b === "true";
      const canSeePrices = productDetailsContainer.dataset.canSeePrices === "true";
      const canSeeStock = productDetailsContainer.dataset.canSeeStock === "true";
      const { product, variants } = productData;

      // Obtener nombres y valores de las opciones
      const option1Name = product.options[0].name; // Color
      const option1Values = product.options[0].values;
      const option2Values = product.options[1].values; // Tallas

      // Crear mapa de imágenes
      const imageMap = this.buildImageMap(product.media);

      // Agrupar variantes por color para obtener imágenes
      const variantsByColor = {};
      variants.forEach((variant) => {
        const color = variant.selectedOptions[0].value;
        if (!variantsByColor[color]) {
          variantsByColor[color] = variant;
        }
      });

      // Construir la tabla
      let tableHTML = `
    <table class="variant-table">
      <thead>
        <tr class="variant-table__row">
          <th class="variant-table__header variant-table__color">${option1Name}</th>
          ${option2Values
            .map(
              (size) => `
            <th class="variant-table__header header-talla">${size}</th>
          `
            )
            .join("")}
        </tr>
      </thead>
      <tbody>
  `;

      // Construir filas (una por cada color)
      option1Values.forEach((color) => {
        const firstVariantOfColor = variantsByColor[color];

        // Obtener imagen del color usando el mapa
        let imageHTML = "";
        if (firstVariantOfColor) {
          // Extraer código del color (antes del ' - ')
          const colorCode = this.extractColorCode(color);

          // Buscar imagen en el mapa por código
          let imageUrl = imageMap[colorCode] || imageMap["default"] || "";

          // Redimensionar imagen a 64px de ancho (formato Shopify)
          if (imageUrl) {
            imageUrl = imageUrl.split("?")[0]; // Remover query params
            const urlParts = imageUrl.split(".");
            const extension = urlParts.pop();
            imageUrl = `${urlParts.join(".")}_64x.${extension}`;
          }

          imageHTML = `
            <img 
              src="${imageUrl}" 
              class="variant-table__image" 
              loading="lazy" 
              alt="${color}"
              width="64"
              height="64"
            />
          `;
        }

        // Obtener URL del icono desde metafield
        let iconoUrl = "";
        if (firstVariantOfColor?.icono?.value) {
          try {
            // Parsear el string JSON que contiene un array
            const iconoArray = JSON.parse(firstVariantOfColor.icono.value);
            // Tomar la primera URL del array
            iconoUrl = iconoArray[0] || "";
          } catch (e) {
            console.error("Error parsing icono URL:", e);
            iconoUrl = "";
          }
        }

        tableHTML += `
        <tr class="variant-table__row ">
          <td class="variant-table__cell variant-table__color tooltip">
            ${imageHTML}
            <div class="tratamiento-icon">
              <span class="tooltiptext">Color: ${color}</span>
            </div>
            <div class="flex gap-1">
            <img
              loading="lazy"
              decoding="async"
              class="variant-table__icon"
              src="${iconoUrl}?width=48"
              alt=""
              width="24"
              height="24"
            />
            <p class="variant-table__color-name text-left text-xs mt-1 mb-1">${this.extractColorCode(
              color
            )}</p>
            </div>
          </td>
        `;

        // Construir celdas para cada talla
        option2Values.forEach((size) => {
          // Buscar la variante actual para esta combinación
          const currentVariant = variants.find(
            (v) =>
              v.selectedOptions[0].value === color &&
              v.selectedOptions[1].value === size
          );

          if (currentVariant) {
            const descatalogado =
              currentVariant.descatalogado?.value === "true";
            const price = parseFloat(currentVariant.price.amount);
            const stock = currentVariant.quantityAvailable || 0;

            // Extraer solo el ID numérico de la variante
            const variantId = this.extractVariantId(currentVariant.id);

            // Determinar si el input debe estar deshabilitado
            const inputDisabled = price === 0 || (descatalogado && stock === 0);

            const disabledStyles = inputDisabled
              ? "background-color: rgb(239, 239, 239); border: 1px solid rgb(200, 200, 200);"
              : "";

            const buttonDisabledStyles = inputDisabled
              ? "pointer-events: none"
              : "";

            const inputDisabledStyles = inputDisabled
              ? "background-color: rgb(239, 239, 239); pointer-events: none; color: rgb(var(--input-text-color))"
              : "";

            // Determinar max quantity
            const maxAttr = descatalogado ? `max="${stock}"` : "";

            tableHTML += `
          <td class="variant-table__cell variant-table__cell--quantity">
        `;

            if (canOrder) {
              tableHTML += `
            <div class="qty-input qty-input--combined inline-flex items-center" 
                 style="${disabledStyles}">
              <button type="button" 
                      class="qty-input__btn btn btn--minus no-js-hidden" 
                      name="minus"
                      style="${buttonDisabledStyles}"
                      tabindex="-1">
                <span class="visually-hidden">-</span>
              </button>
              <input type="number" 
                     class="quantity-input variant-table__quantity" 
                     min="0" 
                     ${maxAttr}
                     value="0" 
                     data-variant-id="${variantId}" 
                     data-inventory-quantity="${stock}"
                     data-variant-title="${currentVariant.title}" 
                     name="variant-${variantId}"
                     style="${inputDisabledStyles}"
                     aria-label="Cantidad para ${currentVariant.title}">
              <button type="button" 
                      class="qty-input__btn btn btn--plus no-js-hidden" 
                      name="plus"
                      style="${buttonDisabledStyles}"
                      tabindex="-1">
                <span class="visually-hidden">+</span>
              </button>
            </div>
            ${this.buildPriceHTML(currentVariant, canSeePrices)}
            ${this.buildStockIndicator(
              currentVariant,
              descatalogado,
              canSeeStock
            )}           
          `;
            }

            tableHTML += `
          </td>
        `;
          } else {
            // Si no existe la variante, celda vacía
            tableHTML += `<td class="variant-table__cell variant-table__cell--quantity"></td>`;
          }
        });

        tableHTML += `</tr>`;
      });

      // Cerrar tbody y agregar footer
      tableHTML += `
      </tbody>
      </table>

      <div class="variant-table-last-row-wrapper">
        <div class="variant-table__last-row">
          <div>
            <div class="quick_add-control flex justify-between mb-2 gap-2 h-full">
              <div class="flex justify-start items-center gap-theme pl-6">
  `;
// PENDIENTE: TRADUCCIONES DE INDICADORES
      if (canOrder) {
        tableHTML += `
                <div class="variant-table__loader is-loading hidden"></div>
                <button class="btn btn--primary btn--lg js-actualizar-carrito-rapido" disabled="">ACTUALIZAR CARRITO</button>
                <a href="/cart" aria-label="Ver carrito" class="btn btn--secondary btn--sm variant-table__view-cart-button js-prod-link">
                  Ver carrito</a>
    `;
      }

      tableHTML += `
              </div>
              <div class="quick_add-totals flex justify-end items-center gap-theme">
  `;

      if (isB2B && canSeePrices) {
        tableHTML += `
                <div class="upng-price-wrapper--pvd">
                  <span class="variant-table__total">Subtotal:</span>
                  <span class="variant-table__subtotal-value">
                    <strong>€0,00</strong>
                  </span>
                </div>
    `;
      }

      // PENDIENTE: TRADUCCIONES DE INDICADORES

      tableHTML += `
                <div class="flex flex-col items-start quick_add-items" style="width: fit-content; padding-right: 3rem;">
                  <span class="variant-table__total-items-value"><strong>0</strong></span>
                  <span class="variant-table__total">Total artículos</span>
                </div>
              </div>

                <div class="clear-container flex justify-end">
                  <button class="opener_inactive quick_add-clear_all btn btn--sm btn--icon text-current tap-target text-error-text" aria-label="Borrar todo">
                    <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" focusable="false" role="presentation" class="icon"><path d="M14 3h-3.53a3.07 3.07 0 0 0-.6-1.65C9.44.82 8.8.5 8 .5s-1.44.32-1.87.85A3.06 3.06 0 0 0 5.53 3H2a.5.5 0 0 0 0 1h1.25v10c0 .28.22.5.5.5h8.5a.5.5 0 0 0 .5-.5V4H14a.5.5 0 0 0 0-1zM6.91 1.98c.23-.29.58-.48 1.09-.48s.85.19 1.09.48c.2.24.3.6.36 1.02h-2.9c.05-.42.17-.78.36-1.02zm4.84 11.52h-7.5V4h7.5v9.5z" fill="currentColor"></path><path d="M6.55 5.25a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 1 0v-6a.5.5 0 0 0-.5-.5zm2.9 0a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 1 0v-6a.5.5 0 0 0-.5-.5z" fill="currentColor"></path></svg>
                    <span>Borrar todo</span>
                  </button>
                  <div class="quick_add-clear_confirmation hidden flex gap-1 justify-center items-center">
                    <button class="btn btn--secondary btn--sm text-current tap-target quick_add-mantener" aria-label="Eliminar">
                      <span>No, Mantener</span>
                    </button>
                    <button class="btn btn--sm text-current tap-target js-remove-item text-error-text variant-table__clear-button" aria-label="Eliminar">
                      <span>Si, Borrar Todo</span>
                    </button>
                  </div>
                </div>
                
            </div>
          </div>
        </div>
        <div class="variant-table__indicadores flex items-center">
          <div class="text-xs product-inventory__status" data-inventory-level="normal">Unidades Disponibles</div>
          <div class="text-xs product-inventory__status" data-inventory-level="backordered">Sin stock, próxima entrada</div>
          <div class="text-xs product-inventory__status" data-inventory-level="low">OUTLET, últimas unidades</div>
          <div class="text-xs product-inventory__status" data-inventory-level="very_low">No Disponible</div>
        </div>
      </div>
    
  `;

      return tableHTML;
    }

    // ========================================================================================================================
    // FIN CONSTRUCCION DE TABLA COMPACTA DE VARIANTES
    // ========================================================================================================================

    // ============================================================================
    // MANEJO BOTÓN ACTUALIZAR CARRITO
    // ============================================================================

    /**
     * Inicializa el botón de agregar/actualizar carrito
     */
    initAddToCartButton() {
      this.addToCartBtn = this.content.querySelector(
        ".js-actualizar-carrito-rapido"
      );

      if (!this.addToCartBtn) {
        console.warn("Botón js-actualizar-carrito-rapido no encontrado");
        return;
      }

      // Bind del event listener
      this.boundHandleAddToCartClick = this.handleAddToCartClick.bind(this);
      this.addToCartBtn.addEventListener(
        "click",
        this.boundHandleAddToCartClick
      );

      // Establecer estado inicial del botón
      this.updateAddToCartButtonState();
    }

    /**
     * Actualiza el estado (texto y habilitación) del botón según cambios pendientes
     */
    updateAddToCartButtonState() {
      if (!this.addToCartBtn) return;

      // VALIDAR que variantsData existe
      if (!this.variantsData || !this.variantsData.variants) {
        console.warn("variantsData no disponible aún");
        return;
      }

      const hasPending = this.hasPendingChanges();

      // Obtener IDs de variantes de este producto
      const productVariantIds = this.variantsData.variants.map((v) =>
        parseInt(this.extractVariantId(v.id))
      );

      const hasItemsInCart = this.cartItems?.some((item) => {
        return productVariantIds.includes(item.variant_id);
      });

      // Determinar texto del botón
      if (hasItemsInCart) {
        this.addToCartBtn.textContent = "ACTUALIZAR CARRITO";
      } else {
        this.addToCartBtn.textContent = "AGREGAR AL CARRITO";
      }

      // Habilitar/deshabilitar según haya cambios pendientes
      this.addToCartBtn.disabled = !hasPending;
    }

    /**
     * Maneja el click en el botón de agregar/actualizar carrito
     * Procesa TODOS los cambios pendientes en una sola operación
     */
    async handleAddToCartClick(event) {
      event.preventDefault();

      if (this._state.isUpdating || !this.hasPendingChanges()) return;

      this.enableTableLoader();

      try {
        this._state.isUpdating = true;

        // Obtener cambios pendientes
        const changes = { ...this._state.pendingChanges };

        console.log("Procesando cambios:", changes);

        // Preparar updates para la API
        const updates = {};
        for (const [variantId, newQuantity] of Object.entries(changes)) {
          updates[variantId] = newQuantity;
        }

        // Llamar a la API con todos los cambios
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
          // Actualizar cartItems
          this.cartItems = updatedCart.items;

          // Actualizar inputs con valores del carrito
          this.updateQuantityInputsFromCart(updatedCart.items);

          // Actualizar totales
          this.updateTableTotals(updatedCart.items);

          // Limpiar cambios pendientes
          this.clearPendingChanges();

          // Actualizar estado del botón
          this.updateAddToCartButtonState();

          // Refrescar drawer del carrito
          document.dispatchEvent(
            new CustomEvent("dispatch:cart-drawer:refresh", {
              bubbles: true,
            })
          );

          // Actualizar el ícono del carrito en Header
          await this.updateCartIconBubble();

          // Disparar evento de cambio en el carrito
          document.dispatchEvent(
            new CustomEvent("on:cart:update", {
              detail: {
                cart: updatedCart,
              },
              bubbles: true,
            })
          );
        }
      } catch (error) {
        console.error("Error updating cart:", error);

        document.dispatchEvent(
          new CustomEvent("on:cart:error", {
            detail: {
              error: error.message,
            },
            bubbles: true,
          })
        );

        // En caso de error, restaurar desde carrito
        await this.syncTableWithCart();
        this.clearPendingChanges();
        this.updateAddToCartButtonState();
      } finally {
        this._state.isUpdating = false;
        this.disableTableLoader();
      }
    }

    /**
     * Inicializa los event listeners para el flujo de confirmación de borrado
     */
    initClearConfirmation() {
      const tableWrapper = this.content.querySelector("#variant-table-wrapper");
      if (!tableWrapper) return;

      // Referencias a elementos
      this.clearAllBtn = tableWrapper.querySelector(".quick_add-clear_all");
      this.clearConfirmationDiv = tableWrapper.querySelector(".quick_add-clear_confirmation");
      this.mantenerBtn = tableWrapper.querySelector(".quick_add-mantener");

      if (!this.clearAllBtn || !this.clearConfirmationDiv || !this.mantenerBtn) {
        console.warn("No se encontraron elementos de confirmación de borrado");
        return;
      }

      // Bind de métodos
      this.boundShowClearConfirmation = this.showClearConfirmation.bind(this);
      this.boundHideClearConfirmation = this.hideClearConfirmation.bind(this);

      // Event listeners
      this.clearAllBtn.addEventListener("click", this.boundShowClearConfirmation);
      this.mantenerBtn.addEventListener("click", this.boundHideClearConfirmation);
    }

    /**
     * Muestra el modal de confirmación y oculta el botón principal
     * @param {Event} event - Evento de click
     */
    showClearConfirmation(event) {
      event.preventDefault();
      event.stopPropagation(); // Evitar que se propague al handleClearAllClick

      if (!this.clearAllBtn || !this.clearConfirmationDiv) return;

      this.clearAllBtn.classList.add("hidden");
      this.clearAllBtn.classList.remove("btn");
      this.clearConfirmationDiv.classList.remove("hidden");
    }

    /**
     * Oculta el modal de confirmación y muestra el botón principal
     * @param {Event} event - Evento de click
     */
    hideClearConfirmation(event) {
      event.preventDefault();

      if (!this.clearAllBtn || !this.clearConfirmationDiv) return;

      this.clearConfirmationDiv.classList.add("hidden");
      this.clearAllBtn.classList.remove("hidden");
      this.clearAllBtn.classList.add("btn");
    }


    /**
     * Desconecta los event listeners y el observer cuando el componente se elimina del DOM
     */
    disconnectedCallback() {
      document.removeEventListener("click", this.documentClickHandler);
      document.querySelectorAll(".js-quick-add").forEach((button) => {
        button.removeEventListener(
          "mouseenter",
          this.quickAddButtonMouseEnterHandler
        );
      });
      if (this.observer) this.observer.disconnect();

      // NUEVO: Limpiar listeners del carrito
      document.removeEventListener("on:cart:add", this.boundHandleCartAdd);
      document.removeEventListener(
        "on:line-item:change",
        this.boundHandleLineItemChange
      );

      // NUEVO: Limpiar listeners de inputs
      if (this.quantityInputs) {
        this.quantityInputs.forEach((input) => {
          input.removeEventListener("change", this.boundHandleQuantityChange);
          input.removeEventListener("focus", this.boundHandleInputFocus);
          input.removeEventListener("keydown", this.boundHandleInputKeydown);
          input.removeEventListener("input", this.boundUpdateLimitState);
        });
      }

      // NUEVO: Limpiar listener del botón
      if (this.addToCartBtn) {
        this.addToCartBtn.removeEventListener(
          "click",
          this.boundHandleAddToCartClick
        );
      }
      // NUEVO: Limpiar listeners de confirmación
      if (this.clearAllBtn) {
        this.clearAllBtn.removeEventListener("click", this.boundShowClearConfirmation);
      }
      if (this.mantenerBtn) {
        this.mantenerBtn.removeEventListener("click", this.boundHideClearConfirmation);
      }
    }

    /**
     * Inicializa los indicadores de stock después de renderizar la tabla
     */
    initializeStockIndicators() {
      const tableWrapper = this.content.querySelector("#variant-table-wrapper");
      if (!tableWrapper) return;

      this.updateAllStockIndicators();
    }

    /**
     * Actualiza todos los indicadores de stock de la tabla compacta
     * @param {Array} [cartItems=null] - Items del carrito (opcional)
     */
    updateAllStockIndicators(cartItems = null) {
      const items = cartItems || [];
      const stockIndicators = this.content.querySelectorAll(
        ".js-stock-indicator"
      );

      stockIndicators.forEach((indicator) => {
        // Buscar el input en la misma celda para obtener variantId
        const cell = indicator.closest(".variant-table__cell");
        if (!cell) return;

        const input = cell.querySelector(
          ".variant-table__quantity[data-variant-id]"
        );
        if (!input) return;

        const variantId = input.dataset.variantId;
        const cartItem = items.find((item) => item.variant_id == variantId);
        const quantity = cartItem ? cartItem.quantity : 0;

        indicator.dataset.quantity = quantity;
        this.updateStockDisplay(indicator, quantity);
      });
    }

    /**
     * Actualiza un indicador de stock específico para una variante (ACTUALIZADO - acepta cartItems opcional)
     * @param {string} variantId - ID de la variante a actualizar
     * @param {Array} [cartItems=null] - Items del carrito (opcional)
     */
    updateStockIndicator(variantId, cartItems = null) {
      const items = cartItems || this.cartItems || [];

      // Buscar el input con este variantId
      const input = this.content.querySelector(
        `.variant-table__quantity[data-variant-id="${variantId}"]`
      );
      if (!input) return;

      // Obtener el indicador en la misma celda
      const cell = input.closest(".variant-table__cell");
      if (!cell) return;

      const indicator = cell.querySelector(".js-stock-indicator");
      if (!indicator) return;

      const cartItem = items.find((item) => item.variant_id == variantId);
      const quantity = cartItem ? cartItem.quantity : 0;

      // Actualizar el atributo data-quantity
      indicator.dataset.quantity = quantity;

      // Actualizar el contenido visible
      this.updateStockDisplay(indicator, quantity);
    }

    /**
     * Actualiza la visualización del indicador de stock según disponibilidad
     * @param {HTMLElement} indicator - Elemento indicador del DOM
     * @param {number} cartQuantity - Cantidad actual en el carrito
     */
    async updateStockDisplay(indicator, cartQuantity) {
      const stockShopify = parseInt(indicator.dataset.stockShopify) || 0;
      const stockDisponible = parseInt(indicator.dataset.stockDisponible) || 0;
      const descatalogado = indicator.dataset.descatalogado === "true";
      const id_erp = indicator.dataset.id_erp;

      // Cargar traducciones desde el contexto global
      const availableText = window.translations?.availableText || "Disponibles";
      const backorderText = window.translations?.backorderText || "en 2 días";
      const remainingText = window.translations?.remainingText || "Restante";
      const askText = window.translations?.askText || "Contáctanos";

      // Calcular cifra stock normal
      const stockMostrar = stockShopify > 10 ? "+10" : stockShopify.toString();

      // Determinar el nivel de inventario (para estilos CSS)
      if (descatalogado) {
        if (stockShopify === 0) {
          // Estilo en ROJO de No Disponible
          indicator.dataset.inventoryLevel = "very_low";
        } else {
          // Estilo en Amarillo Outlet
          indicator.dataset.inventoryLevel = "low";
        }
      } else {
        if (stockShopify <= 0) {
          // Estilo en AZUL de Próxima llegada
          indicator.dataset.inventoryLevel = "backordered";
        } else {
          // Estilo en VERDE de disponible
          indicator.dataset.inventoryLevel = "normal";
        }
      }

      // Mostrar stock según cantidad en carrito
      if (cartQuantity <= stockShopify) {
        indicator.textContent = stockMostrar;
      } else {
        const mensajes = [];

        // MENSAJE_INICIAL con cifra stock normal
        mensajes.push(`${stockShopify} ${availableText}`);

        // MENSAJE_DISP 2 DIAS
        if (stockDisponible !== 0) {
          mensajes.push(`${stockDisponible} ${backorderText}`);
        }

        // MENSAJE_RESTO - Solo si NO está descatalogado
        if (!descatalogado) {
          // Verificar si la función getDateStock existe
          if (typeof getDateStock === "function") {
            try {
              const dateStock = await getDateStock(id_erp, cartQuantity);

              if (dateStock.status === "success" && dateStock.date) {
                mensajes.push(`${remainingText} ${dateStock.date}`);
              } else {
                mensajes.push(`${remainingText} ${askText}`);
              }
            } catch (error) {
              console.error(`Error obteniendo fecha para ${id_erp}:`, error);
              mensajes.push(`${remainingText} ${askText}`);
            }
          } else {
            // Si no existe la función, solo mostrar mensaje genérico
            mensajes.push(`${remainingText} ${askText}`);
          }
        }

        // Unir mensajes con saltos de línea
        indicator.innerHTML = mensajes.join("<br>");
      }
    }

    // ============================================================================
    // NUEVOS - SINCRONIZACIÓN CON EVENTOS DEL CARRITO
    // ============================================================================

    /**
     * NUEVO: Maneja evento on:cart:add
     * @param {CustomEvent} event - Evento de añadir al carrito
     */
    handleCartAdd(event) {
      const { cart } = event.detail;
      this.updateQuantityInputsRespectingPending(cart.items);
    }

    /**
     * NUEVO: Maneja evento on:line-item:change
     * @param {CustomEvent} event - Evento de cambio en línea del carrito
     */
    handleLineItemChange(event) {
      const { cart } = event.detail;
      this.updateQuantityInputsRespectingPending(cart.items);
    }

    /**
     * NUEVO: Actualiza los inputs respetando los cambios pendientes
     * Si hay un pending change, usa ese valor. Si no, usa el del carrito
     * @param {Array} cartItems - Items del carrito real
     */
    updateQuantityInputsRespectingPending(cartItems) {
      if (!this.quantityInputs) return;

      // Actualizar this.cartItems
      this.cartItems = cartItems;

      this.quantityInputs.forEach((input) => {
        const variantId = input.getAttribute("data-variant-id");

        // Primero verificar si hay un pending change para esta variante
        let newQuantity;
        if (this._state.pendingChanges.hasOwnProperty(variantId)) {
          // Usar el valor pendiente
          newQuantity = this._state.pendingChanges[variantId];
        } else {
          // Usar el valor del carrito
          const cartItem = cartItems.find(
            (item) => item.variant_id === parseInt(variantId)
          );
          newQuantity = cartItem ? cartItem.quantity : 0;
        }

        // Actualizar el valor del input solo si es diferente
        if (input.value != newQuantity) {
          input.value = newQuantity;
          this.updateInputLimitState(input);
        }
      });

    }

    /**
     * Vincula el evento mouseenter a un botón de quick add si no está ya vinculado
     * @param {Element} button - Elemento botón al que vincular el evento mouseenter
     */
    bindQuickAddButtonMouseEnter(button) {
      if (!button.dataset.quickAddListenerAdded) {
        button.dataset.quickAddListenerAdded = "true";
        button.addEventListener(
          "mouseenter",
          this.quickAddButtonMouseEnterHandler
        );
      }
    }

    /**
     * Inicia el fetch al pasar el mouse sobre un botón de quick add
     * para mejorar la percepción de rendimiento
     * @param {object} evt - Objeto evento
     */
    handleQuickAddButtonMouseEnter(evt) {
      if (!this.fetchedUrls.includes(evt.target.dataset.productUrl)) {
        this.fetch = {
          url: evt.target.dataset.productUrl,
          promise: fetch(evt.target.dataset.productUrl),
        };
        this.fetchedUrls.push(evt.target.dataset.productUrl);
      }
    }

    /**
     * Maneja eventos 'click' en el enlace 'Ver carrito' de la notificación de éxito
     * @param {object} evt - Objeto evento
     */
    handleOpenCartClick(evt) {
      // Abrir el drawer del carrito si está disponible en la página
      if (this.cartDrawer) {
        evt.preventDefault();
        this.cartDrawer.open();
      } else if (window.location.pathname === theme.routes.cart) {
        evt.preventDefault();
        this.close();
      }
    }

    /**
     * Maneja eventos 'click' en el documento
     * @param {object} evt - Objeto evento
     */
    handleDocumentClick(evt) {
      if (!evt.target.matches(".js-quick-add")) return;

      // Cerrar el drawer del carrito si está abierto
      if (this.cartDrawer && this.cartDrawer.ariaHidden === "false") {
        const overlay = document.querySelector(".js-overlay.is-visible");
        if (overlay) overlay.style.transitionDelay = "200ms";

        this.cartDrawer.close();

        // Esperar unos ms para una mejor ux/animación
        setTimeout(() => {
          this.backBtn.hidden = false;
          this.open(evt.target);
          if (overlay) overlay.style.transitionDelay = "";
        }, 200);
      } else {
        this.open(evt.target);
      }
    }

    /**
     * Maneja eventos 'on:variant:change' en el drawer de Quick Add
     * @param {object} evt - Objeto evento
     */
    async handleVariantChange(evt) {
      let url = this.productUrl;

      if (evt.detail.variant) {
        const separator = this.productUrl.split("?").length > 1 ? "&" : "?";
        url += `${separator}variant=${evt.detail.variant.id}`;
      }

      this.querySelectorAll(".js-prod-link").forEach((link) => {
        link.href = url;
      });

      // Hacer fetch para actualizar tratamientos
      const tratamientosModal = document.querySelector(".tratamientos-modal");

      try {
        // Hacer petición AJAX para obtener los tratamientos
        const response = await fetch(`${url}&view=upng-tratamientos`);
        if (!response.ok) throw new Error("Error loading treatment data");

        const html = await response.text();

        // Actualizar el contenedor con el HTML recibido
        tratamientosModal.innerHTML = html;
      } catch (error) {
        console.error("Error actualizando iconos de tratamiento:", error);
      }
    }

    /**
     * Abre el drawer y obtiene detalles del producto (SIMPLIFICADO)
     */
    async open(opener) {
      opener.setAttribute("aria-disabled", "true");
      if (this.notification) this.notification.hidden = true;

      // Mismo producto: solo abrir
      if (this.productUrl === opener.dataset.productUrl) {
        super.open(opener);
        opener.removeAttribute("aria-disabled");
        if (!this._listenersAdded) {
          document.addEventListener("on:cart:add", this.boundHandleCartAdd);
          document.addEventListener("on:line-item:change", this.boundHandleLineItemChange);
          this._listenersAdded = true;
        }
        return;
      }

      // Nuevo producto
      this.productUrl = opener.dataset.productUrl;
      const handle = this.productUrl.split("/products/")[1].split("?")[0];
      
      // Aplicar estilos de carga
      const prevCursor = document.body.style.cursor || "auto";
      document.body.style.cursor = "wait";
      this.classList.add("is-loading");
      this.content.classList.add("drawer__content--out");
      this.footer.classList.add("drawer__footer--out");
      
      // Timeout de seguridad (80s máximo)
      const safetyTimeout = setTimeout(() => {
        document.body.style.cursor = prevCursor;
        this.classList.remove("is-loading");
        this.content.classList.remove("drawer__content--out");
        this.footer.classList.remove("drawer__footer--out");
      }, 8000);

      try {
        // Fetch paralelo
        const [variants, response] = await Promise.all([
          this.fetchAllVariants(handle).catch(() => null),
          this.fetch?.url === this.productUrl 
            ? this.fetch.promise 
            : (this.fetch = { url: this.productUrl, promise: fetch(this.productUrl) }).promise
        ]);

        this.variantsData = variants;
        
        if (!response?.ok) {
          throw new Error(`Fetch failed: ${response?.status || 'No response'}`);
        }

        // Renderizar
        const tmpl = document.createElement("template");
        tmpl.innerHTML = await response.text();
        this.productEl = tmpl.content.querySelector(".cc-main-product .js-product");
        
        this.content.innerHTML = "";
        super.open(opener);
        this.renderProduct(opener);
        
        // Listeners
        if (!this._listenersAdded) {
          document.addEventListener("on:cart:add", this.boundHandleCartAdd);
          document.addEventListener("on:line-item:change", this.boundHandleLineItemChange);
          this._listenersAdded = true;
        }

      } catch (error) {
        console.error("Error loading product:", error);
        this.content.innerHTML = `<div class="drawer__error">Error al cargar el producto.</div>`;
        super.open(opener);
        this.fetch = null;
        
      } finally {
        clearTimeout(safetyTimeout);
        document.body.style.cursor = prevCursor;
        this.classList.remove("is-loading");
        this.content.classList.remove("drawer__content--out");
        this.footer.classList.remove("drawer__footer--out");
        opener.removeAttribute("aria-disabled");
      }
    }

    /**
     * Cierra el drawer del carrito (ACTUALIZADO)
     */
    close() {
      super.close(() => {
        this.backBtn.hidden = true;
      });

      // NUEVO: Remover listeners de eventos globales cuando se cierra
      document.removeEventListener("on:cart:add", this.boundHandleCartAdd);
      document.removeEventListener(
        "on:line-item:change",
        this.boundHandleLineItemChange
      );
    }

    /**
     * Renderiza los detalles del producto en el drawer
     * @param {Element} opener - Elemento que activó la apertura del drawer
     */
    renderProduct(opener) {
      // Reemplazar instancias del section id para prevenir duplicados en la página del producto
      const sectionId = this.productEl.dataset.section;
      this.productEl.innerHTML = this.productEl.innerHTML.replaceAll(
        sectionId,
        "quickadd"
      );

      // Prevenir que el selector de variante actualice la URL al cambiar
      // VARIANT PICKER NO ESTÁ RENDERIZADO EN EL QUICK ADD
      const variantPicker = this.productEl.querySelector("variant-picker");
      if (variantPicker) {
        variantPicker.dataset.updateUrl = "false";
        this.selectFirstVariant =
          variantPicker.dataset.selectFirstVariant === "true";
      }

      // Remover modal y enlace del size chart (si existen)
      const sizeChartModal = this.productEl.querySelector(
        '[data-modal="size-chart"]'
      );
      if (sizeChartModal) {
        sizeChartModal.remove();
      }

      this.updateContent();
      this.updateForm();

      // Actualizar el media del producto
      const activeMedia = this.productEl.querySelector(
        ".media-viewer__item.is-current-variant"
      );
      if (activeMedia) this.updateMedia(activeMedia.dataset.mediaId);

      if (opener.dataset.selectedColor && this.selectFirstVariant) {
        // Timeout para permitir que el VariantPicker se inicialice
        setTimeout(this.setActiveVariant.bind(this, opener), 10);
      }
    }

    /**
     * Establece la variante de color para que coincida con la seleccionada en la tarjeta
     * @param {Element} opener - Elemento que activó la apertura del drawer
     */
    setActiveVariant(opener) {
      const colorOptionBox = this.querySelector(
        `.opt-btn[value="${opener.dataset.selectedColor}"]`
      );
      if (colorOptionBox) {
        this.querySelector(
          `.opt-btn[value="${opener.dataset.selectedColor}"]`
        ).click();
      } else {
        const colorOptionDropdown = this.querySelector(
          `.custom-select__option[data-value="${opener.dataset.selectedColor}"]`
        );
        if (colorOptionDropdown) {
          const customSelect = colorOptionDropdown.closest("custom-select");
          customSelect.selectOption(colorOptionDropdown);
        }
      }
    }

    /**
     * Actualiza el media del producto mostrado
     * @param {string} mediaId - ID del media item a mostrar
     */
    updateMedia(mediaId) {
      const img = this.productEl.querySelector(
        `[data-media-id="${mediaId}"] img`
      );
      if (!img) return;

      const src = img.src
        ? img.src.split("&width=")[0]
        : img.dataset.src.split("&width=")[0];
      const container = this.querySelector(".quick-add-info__media");
      const width = container.offsetWidth;
      const aspectRatio = img.width / img.height;

      container.innerHTML = `
        <img src="${src}&width=${width}" srcset="${src}&width=${width}, ${src}&width=${
        width * 2
      } 2x" width="${width * 2}" height="${(width * 2) / aspectRatio}" alt="${
        img.alt
      }">
      `;
    }

    /**
     * Construye el markup para el elemento de contenido del drawer
     * Si tenemos datos de variantes, renderiza tabla compacta debajo de opciones
     */
    updateContent() {
      let weightElem = this.getElementHtml(".product-info__weight");
      let productComposicion = this.getElementHtml(".product-composicion");
      if (weightElem && weightElem.length > 0) {
        weightElem = `<div class="product-info__weight text-sm mt-2">${weightElem}</div>`;
      }

      this.content.innerHTML = `
        <div class="quick-add-info grid mb-8">
          <div class="quick-add-info__media${
            theme.settings.blendProductImages ? " image-blend" : ""
          }"></div>
          <div class="quick-add-info__details">
            <div class="product-vendor-sku mb-2 text-sm">
              ${this.getElementHtml(".product-vendor-sku")}
            </div>
            <div class="product-info__product-bar flex justify-start">
              <div class=""></div><span>${productComposicion}</span>
            </div>
            <div class="product-title">
              <a class="h6 js-prod-link" href="${this.productUrl}">
                ${this.getElementHtml(".product-title")}
              </a>
            </div>
            ${weightElem}
            <div class="product-price mt-1">
              ${this.getElementHtml(".product-price")}
            </div>
            <div class="view-more-link text-theme-light text-sm">
              <a href="${this.productUrl}" class="link js-prod-link">
                ${theme.strings.viewDetails}
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="presentation" style="vertical-align: middle"><path d="m9.693 4.5 7.5 7.5-7.5 7.5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>              </a>
            </div>
          </div>
          <!-- Opcion doble para mobile -->
          <div class="quick-add-info__details md:hidden"></div>
        </div>
        
      `;
      // PENDIENTE: OCULTO VARIANT PICKER

      if (this.variantsData && this.variantsData.variants.length > 0) {
        const tablaHTML = this.buildTablaCompacta(this.variantsData);

        // Crear un div adicional para la tabla y agregarlo al contenido existente
        const tablaWrapper = document.createElement("div");
        tablaWrapper.id = "variant-table-wrapper";
        tablaWrapper.className = "mt-2";
        tablaWrapper.innerHTML = tablaHTML;

        // Métodos helper para después de cargada la tabla compacta (indicadores de stock)
        setTimeout(() => {
          this.initializeStockIndicators();
          this.initTableEventListeners();
        }, 50);

        // Agregar la tabla al final del contenido
        this.content.appendChild(tablaWrapper);
      }

      // Aplicar estado del 'Switch PVD' al modal
      this.applyPvdToggleState();

      // Obtener variant ID desde aquí para fetchear y actualizar tratamientos
      const variantId = document.querySelector(
        'form#instalments-form-quickadd input[name="id"]'
      ).value;
      //this.fetchTratamientos(variantId);

      this.classList.remove("is-loading");
      this.content.classList.remove("drawer__content--out");
    }

    // ========================================================================================================================
    // FUNCIONALIDAD DE COMPRA RAPIDA: INPUTS, TOTALES Y REMOVER PRODUCTO
    // ========================================================================================================================

    /**
     * Inicializa event listeners después de renderizar tabla (ACTUALIZADO)
     */
    async initTableEventListeners() {
      const tableWrapper = this.content.querySelector("#variant-table-wrapper");
      if (!tableWrapper) return;

      // Guardar referencias a elementos
      this.quantityInputs = tableWrapper.querySelectorAll(
        ".variant-table__quantity"
      );
      this.qtyButtons = tableWrapper.querySelectorAll(".qty-input__btn");
      this.clearAllButton = tableWrapper.querySelector(
        ".variant-table__clear-button"
      );
      this.viewCartButton = tableWrapper.querySelector(
        ".variant-table__view-cart-button"
      );
      this.totalsLoader = tableWrapper.querySelector(".variant-table__loader");
      this.variantTable = tableWrapper.querySelector(".variant-table");
      this.subtotalValueEl = tableWrapper.querySelector(
        ".variant-table__subtotal-value"
      );
      this.totalItemsValueEl = tableWrapper.querySelector(
        ".variant-table__total-items-value"
      );

      // Bind de métodos (ACTUALIZADO - usar boundHandleQuantityChange)
      this.boundHandleQuantityButtonClick =
        this.handleQuantityButtonClick.bind(this);
      this.boundUpdateLimitState = (event) =>
        this.updateInputLimitState(event.target);
      this.boundHandleInputFocus = this.handleInputFocus.bind(this);
      this.boundHandleInputKeydown = this.handleInputKeydown.bind(this);

      // Event listeners en inputs (ACTUALIZADO - usar binding correcto)
      if (this.quantityInputs && this.quantityInputs.length > 0) {
        this.quantityInputs.forEach((input) => {
          if (input.hasAttribute("data-variant-id")) {
            input.addEventListener("change", this.boundHandleQuantityChange);
            input.addEventListener("focus", this.boundHandleInputFocus);
            input.addEventListener("keydown", this.boundHandleInputKeydown);
            input.addEventListener("input", this.boundUpdateLimitState);
          }
        });
      }

      // Event listeners en botones +/-
      if (this.qtyButtons && this.qtyButtons.length > 0) {
        this.qtyButtons.forEach((button) => {
          button.addEventListener("click", this.boundHandleQuantityButtonClick);
        });
      }

      // Event listeners en botones de totales
      if (this.clearAllButton) {
        this.clearAllButton.addEventListener(
          "click",
          this.handleClearAllClick.bind(this)
        );
      }

      // NUEVOS: Agregar al carrito y Borrar producto
      this.initAddToCartButton();
      this. initClearConfirmation();

      // Cargar estado inicial del carrito
      await this.syncTableWithCart();
    }

    /**
     * Sincroniza los inputs de la tabla con el estado actual del carrito (ACTUALIZADO)
     */
    async syncTableWithCart() {
      const cart = await this.fetchCart();

      if (cart && cart.items) {
        this.cartItems = cart.items; // Guardar referencia
        this.updateQuantityInputsFromCart(cart.items);
        this.updateTableTotals(cart.items);
        this.updateAllStockIndicators(cart.items);

        // NUEVO: Limpiar cambios pendientes al sincronizar
        this.clearPendingChanges();

        // NUEVO: Actualizar estado del botón
        this.updateAddToCartButtonState();
      }
    }

    /**
     * Actualiza los valores de los inputs desde el estado del carrito
     * @param {Array} cartItems - Items del carrito de compras
     */
    updateQuantityInputsFromCart(cartItems) {
      if (!this.quantityInputs) return;

      this.quantityInputs.forEach((input) => {
        const variantId = input.getAttribute("data-variant-id");
        const cartItem = cartItems.find(
          (item) => item.variant_id === parseInt(variantId)
        );
        const newQuantity = cartItem ? cartItem.quantity : 0;

        if (input.value != newQuantity) {
          input.value = newQuantity;
          this.updateInputLimitState(input);
        }

        // Actualizar stock indicator de esta variante
        this.updateStockIndicator(variantId, cartItems);
      });

      // Clamp valores iniciales si tienen max
      this.quantityInputs.forEach((input) => {
        if (input.hasAttribute("max")) {
          const max = parseInt(input.max, 10);
          const current = parseInt(input.value, 10);
          if (current > max) {
            input.value = max;
          }
          this.updateInputLimitState(input);
        }
      });
    }

    /**
     * Maneja cambios en los inputs de cantidad (ACTUALIZADO - sin debounce)
     * @param {Event} event - Evento de cambio del input
     */
    async handleQuantityInputChange(event) {
      if (this._state.isUpdating) return;

      const input = event.target;
      const variantId = input.getAttribute("data-variant-id");
      let newQuantity = parseInt(input.value) || 0;

      if (!variantId) {
        console.error("No se encontró variant ID en el input");
        return;
      }

      // Validar límite máximo si existe
      if (input.hasAttribute("max")) {
        const maxQuantity = parseInt(input.max, 10);
        if (newQuantity > maxQuantity) {
          console.warn(
            `Cantidad ${newQuantity} excede el máximo ${maxQuantity}. Ajustando.`
          );
          newQuantity = maxQuantity;
          input.value = maxQuantity;
          this.updateInputLimitState(input);
        }
      }

      // Actualizar pendingChanges en lugar de llamar a la API
      this.updatePendingChange(variantId, newQuantity);

      // Actualizar indicador de stock inmediatamente
      this.updateSingleStockIndicator(variantId, newQuantity);

      // Actualizar estado del botón
      this.updateAddToCartButtonState();
    }

    /**
     * Actualiza el indicador de stock de UNA variante de forma inmediata
     * @param {string} variantId - ID de la variante
     * @param {number} newQuantity - Nueva cantidad del input
     */
    updateSingleStockIndicator(variantId, newQuantity) {
      // Buscar el input con este variantId
      const input = this.content.querySelector(
        `.variant-table__quantity[data-variant-id="${variantId}"]`
      );
      if (!input) return;

      // Obtener el indicador en la misma celda
      const cell = input.closest(".variant-table__cell");
      if (!cell) return;

      const indicator = cell.querySelector(".js-stock-indicator");
      if (!indicator) return;

      // Actualizar el contenido visible con la nueva cantidad
      this.updateStockDisplay(indicator, newQuantity);
    }

    /**
     * Maneja clicks en botones de incrementar/decrementar cantidad (+/-)
     * @param {Event} event - Evento de click
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

      this.updateInputLimitState(input);

      if (input.value !== currentQty) {
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    /**
     * Selecciona todo el texto del input al hacer focus
     * @param {Event} event - Evento de focus
     */
    handleInputFocus(event) {
      if (window.matchMedia("(pointer: fine)").matches) {
        event.target.select();
      }
    }

    /**
     * Maneja la tecla Enter en inputs de cantidad
     * @param {Event} event - Evento de teclado
     */
    handleInputKeydown(event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      event.target.blur();
      event.target.focus();
    }

    /**
     * Actualiza el estado visual del límite del input
     * @param {HTMLInputElement} input - Elemento input a actualizar
     */
    updateInputLimitState(input) {
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

    /**
     * Maneja click en botón "Limpiar todo" - elimina todas las variantes del producto
     * @param {Event} event - Evento de click
     */
    async handleClearAllClick(event) {
      event.preventDefault();
      if (this._state.isUpdating) return;

      // Validar que variantsData existe
      if (!this.variantsData || !this.variantsData.variants) {
        console.warn("variantsData no disponible");
        return;
      }

      this.enableTableLoader();

      try {
        this._state.isUpdating = true;

        // Obtener IDs de todas las variantes del producto actual
        const productVariantIds = this.variantsData.variants.map((v) =>
          this.extractVariantId(v.id)
        );

        // Obtener carrito actual
        const cart = await this.fetchCart();
        if (!cart) {
          throw new Error("No se pudo obtener el carrito");
        }

        // Crear updates para poner a 0 las variantes de este producto
        const updates = {};
        cart.items.forEach((item) => {
          if (productVariantIds.includes(item.variant_id.toString())) {
            updates[item.id] = 0;
          }
        });

        if (Object.keys(updates).length === 0) return;

        // Actualizar carrito
        const response = await fetch("/cart/update.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates }),
        });

        if (!response.ok) throw new Error(`Error ${response.status}`);

        const updatedCart = await response.json();

        // Actualizar interfaz
        this.updateQuantityInputsFromCart(updatedCart.items);

        // Actualizar estados de límite
        this.quantityInputs.forEach((input) => {
          const inputVariantId = input.getAttribute("data-variant-id");
          if (productVariantIds.includes(inputVariantId)) {
            this.updateInputLimitState(input);
          }
        });

        // Refrescar cart drawer
        document.dispatchEvent(
          new CustomEvent("dispatch:cart-drawer:refresh", { bubbles: true })
        );

        // Actualizar cart icon
        await this.updateCartIconBubble();

        // Actualizar totlaes al final
        this.updateTableTotals(updatedCart.items);

      } catch (error) {
        console.error("Error limpiando items:", error);
        document.dispatchEvent(
          new CustomEvent("on:cart:error", {
            detail: { error: error.message },
            bubbles: true,
          })
        );
      } finally {
        this._state.isUpdating = false;
        this.disableTableLoader();
        this.hideClearConfirmation({ preventDefault: () => {} });
      }
    }

    /**
     * Actualiza el estado del botón "Limpiar todo"
     * Habilita/deshabilita según si hay items del producto en carrito
     */
    updateClearButtonState(cartItems) {  // ✅ recibir parámetro
      if (!this.clearAllBtn) return;
      
      if (!this.variantsData || !this.variantsData.variants) {
        console.warn("variantsData no disponible aún");
        return;
      }

      const productVariantIds = this.variantsData.variants.map((v) =>
        parseInt(this.extractVariantId(v.id))
      );

      const hasItemsInCart = cartItems?.some((item) => {  // ✅ usar el parámetro
        return productVariantIds.includes(item.variant_id);
      });

      if (hasItemsInCart) {
        this.clearAllBtn.classList.remove("opener_inactive");
      } else {
        this.clearAllBtn.classList.add("opener_inactive");
      }
    }

    /**
     * Actualiza los totales (subtotal y cantidad de items) en el pie de tabla
     * @param {Array} cartItems - Items del carrito
     */
    updateTableTotals(cartItems) {
      if (!this.subtotalValueEl || !this.totalItemsValueEl) return;

      // Validar que variantsData existe
      if (!this.variantsData || !this.variantsData.variants) {
        console.warn("variantsData no disponible para actualizar totales");
        return;
      }

      // Obtener IDs de variantes de este producto
      const productVariantIds = this.variantsData.variants.map((v) =>
        parseInt(this.extractVariantId(v.id))
      );

      let totalItems = 0;
      let subtotal = 0;

      cartItems.forEach((item) => {
        if (productVariantIds.includes(item.variant_id)) {
          totalItems += item.quantity;
          subtotal += item.final_line_price;
        }
      });

      this.totalItemsValueEl.innerHTML = `<strong>${totalItems}</strong>`;
      this.subtotalValueEl.innerHTML = `<strong>${this.formatMoneyForTable(
        subtotal
      )}</strong>`;

      // Actualizar estado del botón limpiar
      this.updateClearButtonState(cartItems);
    }

    /**
     * Formatea el precio en centavos para mostrar en los totales
     * @param {number} cents - Precio en centavos
     * @returns {string} Precio formateado con símbolo de moneda
     */
    formatMoneyForTable(cents) {
      const amount = (cents / 100).toFixed(2).replace(".", ",");
      return `${amount} €`;
    }

    /**
     * Actualiza el icono y contador del carrito en el header
     */
    async updateCartIconBubble() {
      try {
        const response = await fetch("/?sections=cart-icon-bubble");
        if (!response.ok) throw new Error(`Error ${response.status}`);

        const data = await response.json();

        if (data && data["cart-icon-bubble"]) {
          const cartIconBubble = document.getElementById("cart-icon-bubble");
          if (cartIconBubble) {
            cartIconBubble.innerHTML = data["cart-icon-bubble"];
          }
        }
      } catch (error) {
        console.error("Error actualizando icono del carrito:", error);
      }
    }

    /**
     * Muestra el loader de la tabla y deshabilita interacciones
     */
    enableTableLoader() {
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

    /**
     * Oculta el loader de la tabla y habilita interacciones
     */
    disableTableLoader() {
      if (this.totalsLoader) {
        this.totalsLoader.classList.add("hidden");
      }
      if (this.variantTable) {
        this.variantTable.classList.remove("pointer-events-none");
      }
    }

    /**
     * Aplica el estado actual del toggle PVD al contenido del modal
     * Muestra/oculta precios según la preferencia guardada en sessionStorage
     */
    applyPvdToggleState() {
      const isPvdVisible = sessionStorage.getItem("pvdVisible") !== "false";

      // Mostrar/ocultar precios PVD
      this.content
        .querySelectorAll(".upng-price-wrapper--pvd")
        .forEach((item) => {
          item.style.display = isPvdVisible ? "block" : "none";
        });

      // Agregar/quitar clase strong a precios PVR
      this.content.querySelectorAll(".upng-price-pvr").forEach((item) => {
        if (isPvdVisible) {
          item.classList.remove("upng-price-pvr--strong");
        } else {
          item.classList.add("upng-price-pvr--strong");
        }
      });
    }

    /**
     * Obtiene y actualiza los iconos de tratamientos para una variante
     * @param {string} variantId - ID de la variante
     */
    async fetchTratamientos(variantId) {
      return
 /*      let url = this.productUrl;
      const tratamientosModal = document.querySelector(".tratamientos-modal");
      try {
        // Hacer petición AJAX para obtener los tratamientos
        const response = await fetch(
          `${url}?variant=${variantId}&view=upng-tratamientos`
        );
        if (!response.ok) throw new Error("Error loading treatment data");

        const html = await response.text();

        // Actualizar el contenedor con el HTML recibido
        tratamientosModal.innerHTML = html;
      } catch (error) {
        console.error("Error actualizando iconos de tratamiento:", error);
      } */
    }

    /**
     * Actualiza el formulario del drawer de Quick Add (botones de compra)
     */
    updateForm() {
      const productForm = this.productEl.querySelector("product-form");
      this.footer.classList.remove("quick-add__footer-message");

      if (productForm) {
        this.form.innerHTML = productForm.innerHTML;
        this.form.init();

        if (Shopify && Shopify.PaymentButton) {
          Shopify.PaymentButton.init();
        }
      } else {
        const signUpForm = this.productEl.querySelector(".product-signup");
        if (signUpForm) {
          this.form.innerHTML = signUpForm.innerHTML;
        } else {
          this.footer.classList.add("quick-add__footer-message");
          this.form.innerHTML = ``;
        }
      }

      this.footer.classList.remove("drawer__footer--out");
    }

    /**
     * Obtiene el innerHTML de elementos dentro del elemento de producto
     * @param {string} selector - Selector CSS para el elemento
     * @param {...string} additionalSelectors - Selectores CSS adicionales para elementos
     * @returns {string} HTML concatenado de los elementos encontrados
     */
    getElementHtml(selector, ...additionalSelectors) {
      const selectors = [selector].concat(additionalSelectors);
      let html = "";
      selectors.forEach((sel) => {
        const els = this.productEl.querySelectorAll(sel);
        Array.from(els).forEach((el) => {
          html += el.innerHTML;
        });
      });
      return html;
    }

    /**
     * Muestra un mensaje de "Agregado al carrito" en el drawer
     */
    addedToCart() {
      if (this.notification) {
        setTimeout(() => {
          this.notification.hidden = false;
        }, 300);

        setTimeout(() => {
          this.notification.hidden = true;
        }, this.notification.dataset.visibleFor);
      }
    }
  }

  customElements.define("quick-add-drawer", QuickAddDrawer);
}