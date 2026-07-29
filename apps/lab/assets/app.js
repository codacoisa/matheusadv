    window.addEventListener('DOMContentLoaded', () => {
      const tools = Array.isArray(window.OFFICEJUR_LAB_TOOLS) ? window.OFFICEJUR_LAB_TOOLS : [];
      const container = document.querySelector('#tools');
      const count = document.querySelector('#tool-count');
      const icons = {
        'credit-card': '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 10h18M7 15h3"></path></svg>',
        'folder-tree': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h7l2 2h9v12H3zM7 11h10M7 15h7"></path></svg>'
      };
      const safeToolUrl = (value) => {
        try {
          const url = new URL(String(value || ''), document.baseURI);
          return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
        } catch {
          return '#';
        }
      };

      count.textContent = `${tools.length} ${tools.length === 1 ? 'ferramenta em teste' : 'ferramentas em teste'}`;
      if (!tools.length) {
        container.innerHTML = '<p class="empty">Nenhuma ferramenta está disponível no Lab neste momento.</p>';
        return;
      }

      for (const tool of tools) {
        const link = document.createElement('a');
        link.className = 'tool';
        link.href = safeToolUrl(tool.href);

        const icon = document.createElement('span');
        icon.className = 'tool-icon';
        icon.innerHTML = icons[tool.icon] || icons['folder-tree'];

        const copy = document.createElement('span');
        copy.className = 'tool-copy';
        const name = document.createElement('strong');
        name.textContent = tool.name;
        const description = document.createElement('p');
        description.textContent = tool.description;
        const status = document.createElement('span');
        status.className = 'status';
        status.textContent = tool.status;
        copy.append(name, description, status);

        const arrow = document.createElement('span');
        arrow.className = 'arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';
        link.append(icon, copy, arrow);
        container.append(link);
      }
    });
