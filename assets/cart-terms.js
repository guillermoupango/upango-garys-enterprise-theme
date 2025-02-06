if (!customElements.get('cart-terms')) {
  class CartTerms extends HTMLElement {
    constructor() {
      super();
      this.cartTermsCheckbox = this.querySelector('.js-cart-terms-checkbox');
      this.form = document.getElementById(this.cartTermsCheckbox.getAttribute('form'));
      this.submitHandler = this.handleSubmit.bind(this);
      this.form.addEventListener('submit', this.submitHandler);
    }

    disconnectedCallback() {
      this.form.removeEventListener('submit', this.submitHandler);
    }

    /**
     * Handles cart form submit
     * @param {object} evt - Event object.
     */
    handleSubmit(evt) {
      if (!this.cartTermsCheckbox.checked) {
        evt.preventDefault();
        alert(theme.strings.cartTermsConfirmation); // eslint-disable-line
      }
    }
  }
  customElements.define('cart-terms', CartTerms);
}
