/* global debounce */
if (!customElements.get('cart-note')) {
  class CartNote extends HTMLElement {
    constructor() {
      super();
      this.disclosure = this.closest('details');

      if (this.disclosure && this.disclosure.matches('.cart-note-disclosure')) {
        this.cartNoteToggle = this.disclosure.querySelector('.js-show-note');
      }

      // Referencias a AMBOS textareas
      this.cartNoteField = this.querySelector('#cart-note');
      this.deliveryNoteField = this.querySelector('#delivery-note');

      this.fetchRequestOpts = {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      };

      this.init();
    }

    init() {
      this.debouncedHandleNoteChange = debounce(this.handleNoteChange.bind(this), 300);
      
      // Escuchar cambios en AMBOS textareas
      if (this.cartNoteField) {
        this.cartNoteField.addEventListener('input', this.debouncedHandleNoteChange);
      }
      if (this.deliveryNoteField) {
        this.deliveryNoteField.addEventListener('input', this.debouncedHandleNoteChange);
      }
    }

    handleNoteChange() {
      // Obtener valores actuales de AMBOS campos
      const cartNoteValue = this.cartNoteField ? this.cartNoteField.value : '';
      const deliveryNoteValue = this.deliveryNoteField ? this.deliveryNoteField.value : '';

      // Actualizar el toggle si CUALQUIERA de los dos tiene contenido
      if (this.cartNoteToggle) {
        const hasContent = cartNoteValue.trim() !== '' || deliveryNoteValue.trim() !== '';
        const label = hasContent ? theme.strings.editCartNote : theme.strings.addCartNote;
        if (this.cartNoteToggle.textContent !== label) {
          this.cartNoteToggle.textContent = label;
        }
      }

      // Enviar AMBOS valores en una sola petición
      this.fetchRequestOpts.body = JSON.stringify({
        note: cartNoteValue,
        attributes: {
          'delivery-note': deliveryNoteValue
        }
      });

      fetch(theme.routes.cartUpdate, this.fetchRequestOpts)
        .catch((error) => {
          console.error('Error updating cart notes:', error);
        });
    }
  }

  customElements.define('cart-note', CartNote);
}