import React, { useState, useMemo } from 'https://esm.sh/react@19';
import { createRoot } from 'https://esm.sh/react-dom@19/client';

export function PreferencesApp({ options, initialPreferences, onSave, onClose }) {
  const [activeTab, setActiveTab] = useState('genres');
  const [search, setSearch] = useState('');
  const [preferences, setPreferences] = useState({
    genres: initialPreferences?.genres || [],
    artists: initialPreferences?.artists || [],
    languages: initialPreferences?.languages || []
  });
  const [saving, setSaving] = useState(false);

  const tabs = [
    { id: 'genres', label: 'Genres', icon: '🏷️', count: (options.genres || []).length },
    { id: 'artists', label: 'Artists', icon: '🎤', count: (options.artists || []).length },
    { id: 'languages', label: 'Languages', icon: '🌐', count: (options.languages || []).length },
  ];

  const currentItems = options[activeTab] || [];

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return currentItems;
    return currentItems.filter(item => item.toLowerCase().includes(q));
  }, [currentItems, search]);

  const toggleItem = (category, item) => {
    setPreferences(prev => {
      const list = prev[category] || [];
      const next = list.includes(item)
        ? list.filter(i => i !== item)
        : [...list, item];
      return { ...prev, [category]: next };
    });
  };

  const selectAllVisible = () => {
    setPreferences(prev => {
      const currentList = new Set(prev[activeTab] || []);
      filteredItems.forEach(i => currentList.add(i));
      return { ...prev, [activeTab]: [...currentList] };
    });
  };

  const clearCurrentTab = () => {
    setPreferences(prev => ({ ...prev, [activeTab]: [] }));
  };

  const clearAll = () => {
    setPreferences({ genres: [], artists: [], languages: [] });
  };

  const totalSelected = (preferences.genres.length + preferences.artists.length + preferences.languages.length);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(preferences);
    } finally {
      setSaving(false);
    }
  };

  return React.createElement('div', { className: 'react-preferences-container' },
    // Header Bar
    React.createElement('div', { className: 'pref-header-stats' },
      React.createElement('div', { className: 'pref-stats-badge' },
        React.createElement('span', { className: 'pref-badge-dot' }),
        React.createElement('span', null, `${totalSelected} total preference${totalSelected === 1 ? '' : 's'} active`)
      ),
      totalSelected > 0 && React.createElement('button', {
        type: 'button',
        className: 'pref-clear-all-btn',
        onClick: clearAll
      }, 'Reset all')
    ),

    // Navigation Tabs
    React.createElement('div', { className: 'pref-tabs', role: 'tablist' },
      tabs.map(tab => {
        const isSelected = activeTab === tab.id;
        const selectedCount = (preferences[tab.id] || []).length;
        return React.createElement('button', {
          key: tab.id,
          type: 'button',
          role: 'tab',
          'aria-selected': isSelected,
          className: `pref-tab-btn ${isSelected ? 'active' : ''}`,
          onClick: () => { setActiveTab(tab.id); setSearch(''); }
        },
          React.createElement('span', { className: 'tab-icon' }, tab.icon),
          React.createElement('span', { className: 'tab-name' }, tab.label),
          selectedCount > 0
            ? React.createElement('span', { className: 'tab-pill-count active' }, selectedCount)
            : React.createElement('span', { className: 'tab-pill-count' }, tab.count)
        );
      })
    ),

    // Search and Quick Actions
    React.createElement('div', { className: 'pref-toolbar' },
      React.createElement('div', { className: 'pref-search-box' },
        React.createElement('span', { className: 'pref-search-icon' }, '🔍'),
        React.createElement('input', {
          type: 'text',
          placeholder: `Search ${currentItems.length} ${activeTab}...`,
          value: search,
          onChange: e => setSearch(e.target.value),
          className: 'pref-search-input'
        }),
        search && React.createElement('button', {
          type: 'button',
          className: 'pref-search-clear',
          onClick: () => setSearch('')
        }, '✕')
      ),
      React.createElement('div', { className: 'pref-quick-actions' },
        React.createElement('button', {
          type: 'button',
          className: 'pref-btn-subtle',
          onClick: selectAllVisible,
          title: 'Select all matching items'
        }, 'Select visible'),
        (preferences[activeTab] || []).length > 0 && React.createElement('button', {
          type: 'button',
          className: 'pref-btn-subtle text-danger',
          onClick: clearCurrentTab,
          title: 'Clear selections in this category'
        }, 'Clear category')
      )
    ),

    // Interactive Chips Grid
    React.createElement('div', { className: 'pref-chips-scrollarea' },
      filteredItems.length === 0
        ? React.createElement('div', { className: 'pref-empty-filter' },
            React.createElement('p', null, `No ${activeTab} match "${search}"`),
            React.createElement('button', {
              type: 'button',
              className: 'outline small',
              onClick: () => setSearch('')
            }, 'Clear search')
          )
        : React.createElement('div', { className: 'pref-chips-grid' },
            filteredItems.map(item => {
              const checked = (preferences[activeTab] || []).includes(item);
              return React.createElement('button', {
                key: item,
                type: 'button',
                className: `pref-chip ${checked ? 'selected' : ''}`,
                onClick: () => toggleItem(activeTab, item),
                'aria-pressed': checked
              },
                React.createElement('span', { className: 'pref-chip-check' }, checked ? '✓' : '+'),
                React.createElement('span', { className: 'pref-chip-text' }, item)
              );
            })
          )
    ),

    // Footer with Save Button
    React.createElement('div', { className: 'pref-footer-actions' },
      React.createElement('button', {
        type: 'button',
        className: 'outline',
        onClick: onClose,
        disabled: saving
      }, 'Cancel'),
      React.createElement('button', {
        type: 'button',
        className: 'primary',
        onClick: handleSave,
        disabled: saving
      }, saving ? 'Saving preferences…' : 'Save preferences ↗')
    )
  );
}

let rootInstance = null;

export function mountPreferencesReact({ container, options, initialPreferences, onSave, onClose }) {
  if (!rootInstance) {
    rootInstance = createRoot(container);
  }
  rootInstance.render(
    React.createElement(PreferencesApp, {
      options,
      initialPreferences,
      onSave,
      onClose
    })
  );
}

export function unmountPreferencesReact() {
  if (rootInstance) {
    rootInstance.unmount();
    rootInstance = null;
  }
}
