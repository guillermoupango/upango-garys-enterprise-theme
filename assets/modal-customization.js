class ModalCustomization extends HTMLElement {
  constructor() {
    super();
    this.addEventListener("click", this.handleClick.bind(this));
  }

  /**
   * Handles 'click' events on the modal.
   * @param {object} evt - Event object.
   */
  handleClick(evt) {
    // Solo cerrar si es específicamente el botón de cerrar
    if (evt.target.matches(".js-close-modal")) {
      this.close();
    }

    // Manejar botones de personalización
    if (evt.target.matches(".js-save-customization")) {
      evt.preventDefault();
      console.log(evt.target);
      this.saveCustomization();
      return;
    }

    if (evt.target.matches(".js-remove-customization")) {
      evt.preventDefault();
      console.log(evt.target);
      this.removeCustomization();
      return;
    }
  }

  /**
   * Opens the modal.
   * @param {Element} opener - Modal opener element.
   */
  open(opener) {
    // Prevent page behind from scrolling when modal is open
    this.scrollY = window.scrollY;
    document.body.classList.add("fixed");
    document.body.style.top = `-${this.scrollY}px`;

    this.setAttribute("open", "");
    this.openedBy = opener;

    // Inicializar la lógica del modal
    this.initModalLogic();
  }

  /**
   * Initialize modal logic for customization
   */
  initModalLogic() {
    // Buscar elementos del modal
    this.textarea = this.querySelector('textarea[id^="item-properties-"]');
    this.saveBtn = this.querySelector(".js-save-customization");
    this.removeBtn = this.querySelector(".js-remove-customization");

    if (!this.textarea || !this.saveBtn || !this.removeBtn) return;

    // Obtener valores iniciales
    this.initialValue = this.textarea.value.trim();
    this.currentValue = this.initialValue;

    // Configurar estado inicial de botones
    this.updateButtonStates();

    // Agregar listener para detectar cambios
    this.textarea.addEventListener(
      "input",
      this.handleTextareaChange.bind(this)
    );
  }

  /**
   * Handle textarea changes
   */
  handleTextareaChange() {
    this.currentValue = this.textarea.value.trim();
    this.updateButtonStates();
  }

  /**
   * Update button states based on current vs initial value
   */
  updateButtonStates() {
    const hasChanged = this.currentValue !== this.initialValue;
    const hasInitialValue = this.initialValue !== "";
    const hasCurrentValue = this.currentValue !== "";

    // Botón Guardar: activo solo si hay cambios
    this.saveBtn.disabled = !hasChanged;

    // Botón Remover: lógica más compleja
    if (!hasInitialValue && !hasCurrentValue) {
      // No hay valor inicial ni actual: oculto y deshabilitado
      this.removeBtn.style.display = "none";
      this.removeBtn.disabled = true;
    } else if (hasInitialValue || hasCurrentValue) {
      // Hay valor inicial o actual: visible y activo
      this.removeBtn.style.display = "inline-block";
      this.removeBtn.disabled = false;
    }
  }

  /**
   * Save customization using cart-items updateProperties method
   */
  async saveCustomization() {
    if (!this.textarea) return;

    const lineIndex = this.getLineIndex();
    if (!lineIndex) return;

    const cartItems = this.getCartItemsInstance();
    if (!cartItems) {
      console.error("cart-items element not found");
      return;
    }

    // Mostrar loading state
    this.saveBtn.disabled = true;
    //this.saveBtn.textContent = "Guardando...";

    try {
      // Usar el método del cart-items existente
      await cartItems.updateProperties(lineIndex, {
        customization: this.currentValue,
      });

      // Actualizar valor inicial después de guardar exitosamente
      this.initialValue = this.currentValue;
      this.updateButtonStates();

      // Cerrar modal después de guardar
      this.close();
    } catch (error) {
      console.error("Error saving customization:", error);
      // El error ya se maneja en updateProperties del cart-items
    } finally {
      this.saveBtn.disabled = false;
      this.saveBtn.textContent = "Guardar personalización";
    }
  }

  /**
   * Remove customization using cart-items updateProperties method
   */
  async removeCustomization() {
    const lineIndex = this.getLineIndex();
    if (!lineIndex) return;

    const cartItems = this.getCartItemsInstance();
    if (!cartItems) {
      console.error("cart-items element not found");
      return;
    }

    // Mostrar loading state
    this.removeBtn.disabled = true;
    //this.removeBtn.textContent = "Removiendo...";

    try {
      // Usar el método del cart-items existente
      await cartItems.updateProperties(lineIndex, { customization: "" });

      // Limpiar textarea y actualizar valores
      this.textarea.value = "";
      this.currentValue = "";
      this.initialValue = "";
      this.updateButtonStates();

      // Cerrar modal después de remover
      this.close();
    } catch (error) {
      console.error("Error removing customization:", error);
      // El error ya se maneja en updateProperties del cart-items
    } finally {
      this.removeBtn.disabled = false;
      this.removeBtn.textContent = "Remover personalización";
    }
  }

  /**
   * Get the cart-items instance to reuse its methods
   */
  getCartItemsInstance() {
    return document.querySelector("cart-items");
  }

  /**
   * Get line index from textarea ID
   */
  getLineIndex() {
    if (!this.textarea) return null;
    return this.textarea.id.replace("item-properties-", "");
  }

  /**
   * Closes the modal.
   */
  close() {
    // Restore page position and scroll behaviour.
    document.body.style.top = "";
    document.body.classList.remove("fixed");
    window.scrollTo(0, this.scrollY);

    this.removeAttribute("open");
  }
}

customElements.define("modal-customization", ModalCustomization);

console.log(
  "modal-customization registered:",
  customElements.get("modal-customization")
);
