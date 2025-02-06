if (!customElements.get('product-inventory')) {
  class ProductInventory extends HTMLElement {
    constructor() {
      super();
      if (this.hidden) {
        this.initLazySection();
      } else {
        window.initLazyScript(this, this.initLazySection.bind(this));
      }
    }

    initLazySection() {
      this.inventoryNotice = this.querySelector('.js-inventory-notice');
      this.urgencyMessage = this.querySelector('.js-inventory-urgency');
      this.indicatorBar = this.querySelector('.js-inventory-indicator');
      this.variantInventory = this.getVariantInventory();

      // Bind to on:variant:change event for this product
      const variantPicker = this.closest('.product-info').querySelector('variant-picker');
      if (variantPicker) {
        variantPicker.addEventListener('on:variant:change', this.handleVariantChange.bind(this));
      }

      // Init
      this.updateInventory(
        parseInt(this.dataset.inventoryQuantity, 10),
        this.dataset.variantAvailable === 'true',
        this.dataset.inventoryPolicy
      );
    }

    /**
     * Gets the inventory data for all product variants
     * @returns {?object}
     */
    getVariantInventory() {
      const dataEl = this.querySelector('[type="application/json"]');
      return this.variantInventory || JSON.parse(dataEl.textContent);
    }

    /**
     * Handles a 'change' event on the variant picker element
     * @param {object} evt - Event object
     */
    handleVariantChange(evt) {
      if (evt.detail.variant) {
        const inventory = this.variantInventory.filter(
          (variant) => variant.id === evt.detail.variant.id
        )[0];
        this.updateInventory(
          inventory.inventory_quantity,
          inventory.available,
          inventory.inventory_policy
        );
      } else {
        this.updateInventory(0, false);
        this.hidden = true;
      }
    }

    /**
     *
     * Updates the inventory notice
     * @param {number} count - the inventory quantity available
     * @param {boolean} available - whether current variant is available
     * @param {string} inventoryPolicy - whether product continues selling when out of stock
     */
    updateInventory(count, available, inventoryPolicy) {
      if (count === 0 && !available && this.hidden) {
        return;
      }

      let inventoryLevel;

      if (count <= 0) {
        if (inventoryPolicy === 'continue') {
          inventoryLevel = 'backordered';
        } else if (available) {
          inventoryLevel = 'in_stock';
        } else {
          inventoryLevel = 'none';
        }
      } else if (count <= parseInt(this.dataset.thresholdVeryLow, 10)) {
        inventoryLevel = 'very_low';
      } else if (count <= parseInt(this.dataset.thresholdLow, 10)) {
        inventoryLevel = 'low';
      } else {
        inventoryLevel = 'normal';
      }

      if (((this.dataset.showNotice === 'always'
        || (this.dataset.showNotice === 'low' && inventoryLevel.includes('low')))
        && !(inventoryLevel === 'backordered' && this.dataset.showNoStockBackordered === 'false'))) {
        this.hidden = false;

        // Set the inventory level data attribute
        this.setAttribute('data-inventory-level', inventoryLevel);

        // Determine whether to show the count or not
        if (inventoryLevel === 'backordered') {
          this.inventoryNotice.innerText = '';
        } else if (inventoryLevel !== 'in_stock' && (this.dataset.showCount === 'always' || (this.dataset.showCount === 'low' && inventoryLevel.includes('low')))) {
          this.inventoryNotice.innerText = theme.strings.onlyXLeft.replace('[quantity]', count);
        } else if (inventoryLevel === 'very_low') {
          this.inventoryNotice.innerText = theme.strings.veryLowStock;
        } else if (inventoryLevel === 'low') {
          this.inventoryNotice.innerText = theme.strings.lowStock;
        } else if (inventoryLevel === 'normal' || inventoryLevel === 'in_stock') {
          this.inventoryNotice.innerText = theme.strings.inStock;
        } else if (inventoryLevel === 'none') {
          this.inventoryNotice.innerText = theme.strings.noStock;
        }

        // Update urgency message if needed
        if (this.urgencyMessage) {
          if (inventoryLevel === 'very_low') {
            this.urgencyMessage.innerHTML = this.dataset.textVeryLow;
          } else if (inventoryLevel === 'low') {
            this.urgencyMessage.innerHTML = this.dataset.textLow;
          } else if (inventoryLevel === 'backordered') {
            this.urgencyMessage.innerHTML = this.dataset.textNoStockBackordered;
          } else if (inventoryLevel === 'normal' || inventoryLevel === 'in_stock') {
            this.urgencyMessage.innerHTML = this.dataset.textNormal;
          } else if (inventoryLevel === 'none') {
            this.urgencyMessage.innerHTML = this.dataset.textNoStock;
          }
        }

        // Update the bar indicator
        if (this.indicatorBar) {
          this.indicatorBar.hidden = false;

          let newWidth;
          if ((count >= this.dataset.scale || inventoryLevel === 'in_stock') && inventoryLevel !== 'backordered') {
            newWidth = 100;
          } else {
            newWidth = ((100 / parseInt(this.dataset.scale, 10)) * count).toFixed(1);
          }
          this.indicatorBar.querySelector('span').style.width = `${newWidth}%`;
        }
      } else {
        this.hidden = true;
      }
    }
  }

  customElements.define('product-inventory', ProductInventory);
}
