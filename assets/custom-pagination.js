/**
 * A wrapper to handle the Modern pagination style, and infinite scroll.
 *
 * Usage:
 *  {%- if settings.pagination_style == "modern" or settings.pagination_infinite -%}
 *    <script src="{{ 'custom-pagination.js' | asset_url }}" defer="defer"></script>
 *  {%- endif -%}
 *
 *  {%- paginate thing by stuff -%}
 *    <custom-pagination data-infinite-scroll="{{ settings.pagination_infinite }}"
 *      data-pause-infinite-scroll="false">
 *      <ul>
 *        <li class="js-pagination-result">One</li>
 *        <li class="js-pagination-result">Two</li>
 *        <li class="js-pagination-result">Three</li>
 *      </ul>
 *      {%- if paginate.pages > 1 -%}
 *        {% render 'pagination', paginate: paginate, style: settings.pagination_style %}
 *      {%- endif -%}
 *    </custom-pagination>
 *  {%- endpaginate -%}
 */
if (!customElements.get('custom-pagination')) {
  class CustomPagination extends HTMLElement {
    constructor() {
      super();
      this.init();
      document.addEventListener('on:bfcache:load-restore', this.reload.bind(this));
    }

    disconnectedCallback() {
      this.destroy();
    }

    init() {
      this.infiniteScroll = this.dataset.infiniteScroll === 'true';
      this.pagination = this.querySelector('.js-pagination');
      this.loadMoreButton = this.querySelector('.js-pagination-load-more');
      this.results = this.querySelectorAll('.js-pagination-result');
      this.controller = null;

      // Bind click handlers to pagination results
      this.resultClickHandler = this.resultClickHandler || this.handleResultClick.bind(this);
      this.addEventListener('click', this.resultClickHandler);

      // Bind click handler to load more button click
      this.loadMoreClickHandler = this.loadMoreClickHandler || this.handleLoadMoreClick.bind(this);

      if (this.pagination && this.pagination.dataset.isMoreResults && this.results) {
        if (this.loadMoreButton) this.loadMoreButton.addEventListener('click', this.loadMoreClickHandler);

        if (this.infiniteScroll) {
          this.paginationObserver = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  this.loadMore();

                  // Continue to load results as long as the 'load more' button is visible
                  this.intersectingTimer = setInterval(this.loadMore.bind(this), 1000);
                } else if (this.intersectingTimer) {
                  clearInterval(this.intersectingTimer);
                }
              });
            },
            { rootMargin: `${window.innerHeight * 1.5}px 0px` }
          );

          this.paginationObserver.observe(this.pagination);
        }
      }
    }

    /**
     * Destroys the component
     */
    destroy() {
      if (this.intersectingTimer) clearInterval(this.intersectingTimer);
      if (this.paginationObserver) this.paginationObserver.disconnect();
      if (this.loadMoreButton) this.loadMoreButton.removeEventListener('click', this.loadMoreClickHandler);
      this.removeEventListener('click', this.resultClickHandler);
      this.loadMoreClickHandler = null;
    }

    /**
     * Reloads the component
     */
    reload() {
      this.destroy();
      this.init();
    }

    /**
     * Handles click on the load more button
     * @param {object} evt - Event object
     */
    handleLoadMoreClick(evt) {
      evt.preventDefault();
      this.loadMore();
    }

    /**
     * Handles a click on a item in the pagination
     * @param {object} evt - Event object
     */
    handleResultClick(evt) {
      if (evt.target.closest('a') && evt.target.closest('.js-pagination-result') && this.controller) {
        this.controller.abort();
      }
    }

    /**
     * Fetches more results from the next page of results, and dynamically updates this page
     */
    async loadMore() {
      if (!this.isFetching && this.dataset.pauseInfiniteScroll === 'false') {
        this.isFetching = true;
        this.controller = new AbortController();

        try {
          // Add the loading state to the button
          if (!this.loadMoreButton) throw new Error("No 'Load more' button found.");

          this.loadMoreButton.classList.add('is-loading');
          this.loadMoreButton.setAttribute('aria-disabled', 'true');

          if (this.pagination.dataset.paginationStyle === 'traditional') {
            this.pagination.classList.add('is-loading');
          }

          // Retrieve and parse the next page
          const response = await fetch(this.loadMoreButton.href, {
            signal: this.controller.signal
          });

          if (!response.ok) throw new Error(response.status);
          if (this.dataset.pauseInfiniteScroll === 'true') {
            throw new Error('Infinite scroll was interrupted.');
          }

          const tmpl = document.createElement('template');
          tmpl.innerHTML = await response.text();

          // Append the additional results
          let newResultsHtml = '';
          const lastResult = this.results[this.results.length - 1];
          tmpl.content.querySelectorAll('.js-pagination-result').forEach((result) => {
            newResultsHtml += result.outerHTML;
          });
          lastResult.insertAdjacentHTML('afterend', newResultsHtml);
          this.results = this.querySelectorAll('.js-pagination-result');

          // Update the pagination content
          const newPagination = tmpl.content.querySelector('.js-pagination');
          if (newPagination.dataset.isMoreResults) {
            this.pagination.innerHTML = newPagination.innerHTML;

            // Rebind to the new load more button
            if (this.loadMoreButton) {
              this.loadMoreButton.removeEventListener('click', this.loadMoreClickHandler);
              this.loadMoreButton = this.querySelector('.js-pagination-load-more');
              this.loadMoreButton.addEventListener('click', this.loadMoreClickHandler);
            }
          } else {
            this.pagination.remove();
            if (this.intersectingTimer) clearInterval(this.intersectingTimer);
            if (this.paginationObserver) this.paginationObserver.disconnect();
            document.querySelectorAll('.js-when-paginated-only').forEach((elem) => elem.remove());
          }
        } catch (error) {
          console.log('Unable to fetch next page of results', error); // eslint-disable-line
          if (this.intersectingTimer) clearInterval(this.intersectingTimer);
        } finally {
          this.controller = null;

          // Remove the loading state from the load more button
          if (this.loadMoreButton) {
            this.loadMoreButton.classList.remove('is-loading');
            this.loadMoreButton.removeAttribute('aria-disabled');
          }

          this.isFetching = false;

          if (this.pagination.dataset.paginationStyle === 'traditional') {
            this.pagination.classList.remove('is-loading');
          }
        }
      }
    }
  }

  customElements.define('custom-pagination', CustomPagination);
}
