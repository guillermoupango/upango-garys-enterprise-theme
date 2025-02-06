/* global SideDrawer */

if (!customElements.get('facet-filters')) {
  class FacetFilters extends SideDrawer {
    connectedCallback() {
      this.init();
    }

    disconnectedCallback() {
      window.removeEventListener('popstate', this.historyChangeHandler);

      if (this.breakpointChangeHandler) {
        window.removeEventListener('on:breakpoint-change', this.breakpointChangeHandler);
      }
    }

    init() {
      this.filteringEnabled = this.dataset.filtering === 'true';
      this.sortingEnabled = this.dataset.sorting === 'true';
      this.form = document.getElementById('facets');
      this.results = document.getElementById('filter-results');
      this.expanded = [];
      this.filterChangeTimeout = null;

      this.handleBreakpointChange();
      this.addElements();
      this.addListeners();

      this.historyChangeHandler = this.historyChangeHandler || this.handleHistoryChange.bind(this);
      window.addEventListener('popstate', this.historyChangeHandler);
    }

    addElements() {
      if (this.filteringEnabled) {
        this.filters = this.querySelector('.facets__filters');
        this.activeFilters = this.querySelector('.facets__active-filters');
        this.activeFiltersList = this.querySelector('.active-filters');
        this.activeFiltersHeader = this.querySelector('.active-filters-header');
        this.footer = this.querySelector('.facets__footer');
      }

      if (this.sortingEnabled) {
        this.mobileSortByOptions = this.querySelectorAll('.js-drawer-sort-by');
        this.desktopSortBy = document.querySelector('.products-toolbar__sort');
      }
    }

    addListeners() {
      if (this.filteringEnabled) {
        this.breakpointChangeHandler = this.breakpointChangeHandler
          || this.handleBreakpointChange.bind(this);
        this.filters.addEventListener('click', this.handleFiltersClick.bind(this));
        this.filters.addEventListener('input', this.handleFilterChange.bind(this));
        this.filters.addEventListener('change', this.handleFilterChange.bind(this));
        this.activeFilters.addEventListener('click', this.handleActiveFiltersClick.bind(this));
        window.addEventListener('on:breakpoint-change', this.breakpointChangeHandler);
      }

      if (this.sortingEnabled) {
        this.desktopSortBy.addEventListener('change', this.handleFilterChange.bind(this));
      }
    }

    /**
     * Handles viewport breakpoint changes.
     */
    handleBreakpointChange() {
      if (theme.mediaMatches.lg) {
        this.setAttribute('open', '');
        this.setAttribute('aria-hidden', 'false');
        this.removeAttribute('aria-modal');
        this.removeAttribute('role');
      } else {
        this.close();
        this.setAttribute('role', 'dialog');
        this.setAttribute('aria-modal', 'true');
        this.setAttribute('aria-hidden', 'true');
        this.hidden = false;
      }
    }

    /**
     * Handles 'input' events on the filters and 'change' events on the sort by dropdown.
     * @param {object} evt - Event object.
     */
    handleFilterChange(evt) {
      // Only allow price 'change' events
      if (evt.type === 'change' && !(evt.target.id?.includes('price-range') || evt.target.id?.includes('sort-by'))) return;

      // Dont reload when typing a price
      if (evt.target.id?.includes('price-range') && evt.constructor.name === 'InputEvent') return;

      const timeoutDelay = 500;

      clearTimeout(this.filterChangeTimeout);

      this.filterChangeTimeout = setTimeout(() => {
        const formData = new FormData(this.form);
        const searchParams = new URLSearchParams(formData);
        const emptyParams = [];

        if (this.sortingEnabled) {
          let currentSortBy = searchParams.get('sort_by');

          // Keep the mobile facets form sync'd with the desktop sort by dropdown
          if (evt.target.tagName === 'CUSTOM-SELECT') {
            this.mobileSortByOptions.forEach((option) => {
              option.checked = option.value === evt.detail.selectedValue;
              currentSortBy = evt.detail.selectedValue;
            });
          }

          // Set the 'sort_by' parameter.
          searchParams.set('sort_by', currentSortBy);
        }

        // Get empty parameters.
        searchParams.forEach((value, key) => {
          if (!value) emptyParams.push(key);
        });

        // Remove empty parameters.
        emptyParams.forEach((key) => {
          searchParams.delete(key);
        });

        this.applyFilters(searchParams.toString(), evt);
      }, timeoutDelay);
    }

    /**
     * Handles 'click' events on the filters.
     * @param {object} evt - Event object.
     */
    handleFiltersClick(evt) {
      const { target } = evt;

      // Filter 'clear' button clicked.
      if (target.matches('.js-clear-filter')) {
        evt.preventDefault();
        this.applyFilters(new URL(evt.target.href).searchParams.toString(), evt);
      }

      // Filter 'show more' button clicked.
      if (target.matches('.js-show-more')) {
        const filter = target.closest('.filter');
        target.remove();

        filter.querySelectorAll('li').forEach((el) => {
          el.classList.remove('js-hidden');
        });

        if (!this.expanded.includes(filter.id)) {
          this.expanded.push(filter.id);
        }
      }
    }

    /**
     * Handles 'click' events on the active filters.
     * @param {object} evt - Event object.
     */
    handleActiveFiltersClick(evt) {
      if (evt.target.tagName !== 'A') return;
      evt.preventDefault();
      this.applyFilters(new URL(evt.target.href).searchParams.toString(), evt);
    }

    /**
     * Handles history changes (e.g. back button clicked).
     * @param {object} evt - Event object.
     */
    handleHistoryChange(evt) {
      if (evt.state !== null) {
        let searchParams = '';

        if (evt.state && evt.state.searchParams) {
          ({ searchParams } = evt.state);
        }

        this.applyFilters(searchParams, null, false);
      }
    }

    /**
     * Fetches the filtered/sorted page data and updates the current page.
     * @param {string} searchParams - Filter/sort search parameters.
     * @param {object} evt - Event object.
     * @param {boolean} [updateUrl=true] - Update url with the selected options.
     */
    async applyFilters(searchParams, evt, updateUrl = true) {
      try {
        // Preserve the current element focus
        const activeElementId = document.activeElement.id;

        // Disable infinite scrolling.
        const customPagination = document.querySelector('custom-pagination');
        if (customPagination) customPagination.dataset.pauseInfiniteScroll = 'true';

        // Set loading state.
        this.results.classList.add('is-loading');

        // Disable "Show X results" button until submission is complete.
        const closeBtn = this.querySelector('.js-close-drawer-mob');
        closeBtn.ariaDisabled = 'true';
        closeBtn.classList.add('is-loading');

        // Use Section Rendering API for the request, if possible.
        let fetchUrl = `${window.location.pathname}?${searchParams}`;
        if (this.form.dataset.filterSectionId) {
          fetchUrl += `&section_id=${this.form.dataset.filterSectionId}`;
        }

        // Cancel current fetch request. (Raises an exception)
        if (this.applyFiltersFetchAbortController) {
          this.applyFiltersFetchAbortController.abort('Request changed');
        }
        this.applyFiltersFetchAbortController = new AbortController();

        // Fetch filtered products markup.
        const response = await fetch(fetchUrl, {
          method: 'GET',
          signal: this.applyFiltersFetchAbortController.signal
        });

        if (response.ok) {
          const tmpl = document.createElement('template');
          tmpl.innerHTML = await response.text();

          // Restore UI state.
          this.form.querySelectorAll('details-disclosure > details').forEach((existingFilter) => {
            const target = tmpl.content.getElementById(existingFilter.id);
            if (target) {
              target.open = existingFilter.open;
            }
          });
          tmpl.content.querySelectorAll('#facets details-disclosure > details').forEach((newFilter) => {
            if (this.expanded.includes(newFilter.id)) {
              const hiddenElements = newFilter.querySelectorAll('.js-hidden');
              hiddenElements.forEach((listItem) => {
                listItem.classList.remove('js-hidden');
              });
              newFilter.querySelector('.filter__more')?.remove();
            }
          });

          // Update the filters.
          this.form.innerHTML = tmpl.content.getElementById('facets').innerHTML;

          // Update the label of the mobile filter button
          closeBtn.innerText = tmpl.content.querySelector('.js-close-drawer-mob').innerText;

          // Preserve the CSS class of the results
          const currentResultsUl = this.results.querySelector('ul');
          this.currentResultsClass = currentResultsUl ? this.results.querySelector('ul').getAttribute('class') : this.currentResultsClass;

          // Update the results.
          this.results.innerHTML = tmpl.content.getElementById('filter-results').innerHTML;

          // Set the CSS class of the results to what it was
          const newResultsUl = this.results.querySelector('ul');
          if (newResultsUl && this.currentResultsClass) newResultsUl.setAttribute('class', this.currentResultsClass);

          // Reinitialize re-rendered components.
          this.addElements();
          this.addListeners();

          // Reinitialize any custom pagination
          if (customPagination && customPagination.reload) customPagination.reload();

          // Update the URL.
          if (updateUrl) FacetFilters.updateURL(searchParams);

          // Scroll to the top of the results if needed
          if (this.results.getBoundingClientRect().top < 0) {
            // If the header is sticky, compensate for it when scrolling to elements
            let headerHeight = 0;
            if (document.querySelector('store-header[data-is-sticky="true"]')) {
              headerHeight = Number.parseInt(
                getComputedStyle(this.parentElement)
                  .getPropertyValue('--header-height')
                  .replace('px', ''),
                10
              ) || 0;
            }
            window.scrollTo({
              top: this.results.getBoundingClientRect().top + window.scrollY - headerHeight - 45,
              behavior: 'smooth'
            });
          }

          // Enable the "Show X results" button
          closeBtn.classList.remove('is-loading');
          closeBtn.removeAttribute('aria-disabled');

          // Renable infinite scroll
          if (customPagination) customPagination.dataset.pauseInfiniteScroll = 'false';

          // Focus on the element with the same ID in the new HTML
          if (activeElementId) document.getElementById(activeElementId)?.focus();

          // Broadcast the update for anything else to hook into
          document.dispatchEvent(new CustomEvent('on:facet-filters:updated'), { bubbles: true });
        }
      } catch (error) {
        console.warn(error); // eslint-disable-line
      } finally {
        this.results.classList.remove('is-loading');
      }
    }

    /**
     * Updates the url with the current filter/sort parameters.
     * @param {string} searchParams - Filter/sort parameters.
     */
    static updateURL(searchParams) {
      window.history.pushState(
        { searchParams },
        '',
        `${window.location.pathname}${searchParams && '?'.concat(searchParams)}`
      );
    }
  }

  customElements.define('facet-filters', FacetFilters);
}
