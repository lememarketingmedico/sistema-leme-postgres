(function () {
  'use strict';

  const previousRenderClientPage = window.renderClientPage;
  if (typeof previousRenderClientPage !== 'function') return;

  window.renderClientPage = function () {
    const html = previousRenderClientPage.apply(this, arguments);
    const template = document.createElement('template');
    template.innerHTML = html;

    const tabs = template.content.querySelector('.client-page-tabs');
    const resourceActions = template.content.querySelector('.client-resource-actions');
    if (!tabs || !resourceActions) return html;

    const buttons = Array.from(tabs.querySelectorAll(':scope > button'));
    const siteButton = buttons.find(button => button.textContent.trim() === 'Site');
    const reportButton = buttons.find(button => button.textContent.trim() === 'Relatório completo');
    const insertionPoint = siteButton || reportButton || null;

    const resourceButtons = Array.from(resourceActions.querySelectorAll(':scope > button'));
    const calendarButton = resourceButtons.find(button => button.classList.contains('calendar-prompt-button'));

    resourceButtons.filter(button => button !== calendarButton).forEach(button => {
      tabs.insertBefore(button, insertionPoint);
    });
    if (calendarButton) tabs.appendChild(calendarButton);
    resourceActions.remove();

    return template.innerHTML;
  };

  const style = document.createElement('style');
  style.id = 'leme-client-nav-v11252';
  style.textContent = `
    .client-page-tabs {
      align-items: center;
      width: 100%;
      flex-wrap: nowrap !important;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .client-page-tabs .client-approval-tab {
      margin-left: 0 !important;
      width: auto !important;
    }
    .client-page-tabs button:disabled {
      opacity: .48;
      cursor: not-allowed;
    }
    .client-page-tabs .calendar-prompt-button {
      margin-left: auto;
      flex: 0 0 auto;
      background: #155f8c;
      color: #fff;
      border-color: #1f79ad;
    }
  `;
  document.head.appendChild(style);
})();
