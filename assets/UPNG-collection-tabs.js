class CollectionSelector extends HTMLElement {
  constructor() {
      super();
      this.init();
  }

  async init() {
      this.buttons = this.querySelectorAll('button');
      this.productsContainer = this.closest('.section')
          .querySelector('.products-grid-container ul');
      
      // Vincular eventos
      this.buttons.forEach(button => {
          button.addEventListener('click', this.handleButtonClick.bind(this));
      });

      // Cargar la primera colección al iniciar
      if (this.buttons.length > 0) {
          const firstButton = this.buttons[0];
          firstButton.classList.add('btn--primary', 'pointer-events-none');
          await this.loadCollection(
              firstButton.dataset.collectionHandle,
              firstButton.dataset.sectionId
          );
      }
  }

  async loadCollection(handle, sectionId) {
      try {
          if (this.productsContainer) {
              this.productsContainer.style.opacity = '0.5';
          }
  
          // Usar la vista alternativa
          const url = `/collections/${handle}?view=ajax`;
          console.log('Fetching collection products:', url);
  
          const response = await fetch(url);
          if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
          }
  
          const html = await response.text();
          console.log('Products received:', {
              length: html.length,
              preview: html.substring(0, 100)
          });
  
          if (this.productsContainer) {
              this.productsContainer.innerHTML = html;
              this.productsContainer.style.opacity = '1';
  
              // Reinicializar el carrusel
              const carousel = this.closest('carousel-slider');
              if (carousel) {
                  carousel.removeAttribute('inactive');
              }
          }
      } catch (error) {
          console.error('Error loading collection:', error);
          if (this.productsContainer) {
              this.productsContainer.style.opacity = '1';
              this.productsContainer.innerHTML = '<li class="text-center col-span-full"><p>Error loading products</p></li>';
          }
      }
  }

  async handleButtonClick(event) {
      const button = event.currentTarget;
      const collectionHandle = button.dataset.collectionHandle;
      const sectionId = button.dataset.sectionId;

      // Actualizar estados de botones
      this.buttons.forEach(btn => {
          btn.classList.remove('btn--primary', 'pointer-events-none');
          btn.classList.add('btn--secondary');
      });
      button.classList.remove('btn--secondary');
      button.classList.add('btn--primary', 'pointer-events-none');

      // Cargar la colección
      await this.loadCollection(collectionHandle, sectionId);
  }
}

customElements.define('collection-selector', CollectionSelector);