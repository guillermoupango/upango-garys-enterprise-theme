
class CollectionSelector {
  constructor() {
    this.container = document.querySelector('[data-collection-selector]');
    if (!this.container) return;
    this.buttons = this.container.querySelectorAll('button');
    this.bindEvents();
  }

  bindEvents() {
    this.buttons.forEach(button => {
      button.addEventListener('click', this.handleButtonClick.bind(this));
    });
  };

  handleButtonClick(event) {
    const button = event.currentTarget;
    const sectionId = button.dataset.sectionId;
    const collectionHandle = button.dataset.collectionHandle;

    // Actualizar estado de botones
    this.buttons.forEach(btn => {
      btn.classList.remove('btn--primary', 'pointer-events-none');
      btn.classList.add('btn--secondary');
    });
    button.classList.remove('btn--secondary');
    button.classList.add('btn--primary', 'pointer-events-none');
  };
}

customElements.define('collection-selector', class extends HTMLElement {
  connectedCallback() {
    new CollectionSelector();
  }
});