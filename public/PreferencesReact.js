import React, { useState, useMemo } from 'https://esm.sh/react@19';
import { createRoot } from 'https://esm.sh/react-dom@19/client';

// Simple, consistent Lucide-style line SVG icons (No emojis anywhere)
function Icon({ name, size = 16, className = '' }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: `lucide-icon ${className}`,
    'aria-hidden': 'true',
  };

  switch (name) {
    case 'music': // Music note for Genres
      return React.createElement('svg', props,
        React.createElement('path', { d: 'M9 18V5l12-2v13' }),
        React.createElement('circle', { cx: 6, cy: 18, r: 3 }),
        React.createElement('circle', { cx: 18, cy: 16, r: 3 })
      );
    case 'user': // Person/user for Artists
      return React.createElement('svg', props,
        React.createElement('path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }),
        React.createElement('circle', { cx: 12, cy: 7, r: 4 })
      );
    case 'globe': // Globe for Languages
      return React.createElement('svg', props,
        React.createElement('circle', { cx: 12, cy: 12, r: 10 }),
        React.createElement('line', { x1: 2, y1: 12, x2: 22, y2: 12 }),
        React.createElement('path', { d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' })
      );
    case 'search': // Magnifying glass
      return React.createElement('svg', props,
        React.createElement('circle', { cx: 11, cy: 11, r: 8 }),
        React.createElement('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 })
      );
    case 'plus': // Circular +
      return React.createElement('svg', { ...props, strokeWidth: 2.2 },
        React.createElement('line', { x1: 12, y1: 5, x2: 12, y2: 19 }),
        React.createElement('line', { x1: 5, y1: 12, x2: 19, y2: 12 })
      );
    case 'check': // Checkmark
      return React.createElement('svg', { ...props, strokeWidth: 2.6 },
        React.createElement('polyline', { points: '20 6 9 17 4 12' })
      );
    case 'close': // Close X
      return React.createElement('svg', { ...props, strokeWidth: 2 },
        React.createElement('line', { x1: 18, y1: 6, x2: 6, y2: 18 }),
        React.createElement('line', { x1: 6, y1: 6, x2: 18, y2: 18 })
      );
    default:
      return null;
  }
}

// Curated tasteful photography for "Popular for you" cards with subtle dark overlays
const POPULAR_PRESETS = {
  genres: [
    { name: 'Pop', image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=360&auto=format&fit=crop&q=80' },
    { name: 'Indie', image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=360&auto=format&fit=crop&q=80' },
    { name: 'Bollywood', image: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=360&auto=format&fit=crop&q=80' },
    { name: 'Rock', image: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=360&auto=format&fit=crop&q=80' },
    { name: 'Hip Hop', image: '/images/hip-hop.png' },
    { name: 'R&B', image: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=360&auto=format&fit=crop&q=80' },
  ],
  artists: [
    { name: 'Arijit Singh', image: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=360&auto=format&fit=crop&q=80' },
    { name: 'Coldplay', image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=360&auto=format&fit=crop&q=80' },
    { name: 'Dua Lipa', image: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=360&auto=format&fit=crop&q=80' },
    { name: 'The Weeknd', image: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=360&auto=format&fit=crop&q=80' },
    { name: 'Nirvana', image: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=360&auto=format&fit=crop&q=80' },
    { name: 'Taylor Swift', image: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=360&auto=format&fit=crop&q=80' },
  ],
  languages: [
    { name: 'Hindi', image: 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=360&auto=format&fit=crop&q=80' },
    { name: 'English', image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=360&auto=format&fit=crop&q=80' },
    { name: 'Punjabi', image: '/images/punjabi.png' },
    { name: 'Tamil', image: 'https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=360&auto=format&fit=crop&q=80' },
    { name: 'Spanish', image: 'https://images.unsplash.com/photo-1543783207-ec64e4d95325?w=360&auto=format&fit=crop&q=80' },
    { name: 'Korean', image: 'https://images.unsplash.com/photo-1538485399081-7191377e8241?w=360&auto=format&fit=crop&q=80' },
  ]
};

export function PreferencesApp({ options = {}, initialPreferences = {}, onSave, onClose }) {
  const [activeTab, setActiveTab] = useState('genres');
  const [search, setSearch] = useState('');
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  const [preferences, setPreferences] = useState({
    genres: initialPreferences?.genres || [],
    artists: initialPreferences?.artists || [],
    languages: initialPreferences?.languages || []
  });

  const tabs = [
    { id: 'genres', label: 'Genres', icon: 'music', count: (options.genres || []).length },
    { id: 'artists', label: 'Artists', icon: 'user', count: (options.artists || []).length },
    { id: 'languages', label: 'Languages', icon: 'globe', count: (options.languages || []).length },
  ];

  const currentItems = options[activeTab] || [];
  const selectedInCurrentTab = preferences[activeTab] || [];

  // Filtered complete item list
  const filteredItems = useMemo(() => {
    let items = currentItems;
    if (showSelectedOnly) {
      items = items.filter(item => selectedInCurrentTab.includes(item));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      items = items.filter(item => item.toLowerCase().includes(q));
    }
    return items;
  }, [currentItems, selectedInCurrentTab, search, showSelectedOnly]);

  // Curated popular items for active tab
  const popularCards = useMemo(() => {
    const presets = POPULAR_PRESETS[activeTab] || [];
    // Prioritize configured presets that exist in current options, or fallback to first items
    const available = presets.filter(p => currentItems.some(i => i.toLowerCase() === p.name.toLowerCase()));
    if (available.length >= 4) return available;
    // Fallback: take top items from options
    return currentItems.slice(0, 6).map((item, idx) => ({
      name: item,
      image: presets[idx]?.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=360&auto=format&fit=crop&q=80'
    }));
  }, [activeTab, currentItems]);

  const toggleItem = (category, item) => {
    setPreferences(prev => {
      const list = prev[category] || [];
      const next = list.includes(item)
        ? list.filter(i => i !== item)
        : [...list, item];
      return { ...prev, [category]: next };
    });
  };

  const resetAll = () => {
    setPreferences({ genres: [], artists: [], languages: [] });
  };

  const totalSelected = (preferences.genres.length + preferences.artists.length + preferences.languages.length);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(preferences);
    } finally {
      setSaving(false);
    }
  };

  const currentTabObj = tabs.find(t => t.id === activeTab) || tabs[0];

  return React.createElement('div', { className: 'pref-modal-shell' },
    // 1. Header
    React.createElement('div', { className: 'pref-header' },
      React.createElement('div', { className: 'pref-header-left' },
        React.createElement('span', { className: 'pref-eyebrow' }, 'MAKE IT YOURS'),
        React.createElement('h2', { className: 'pref-title' }, 'Music preferences'),
        React.createElement('p', { className: 'pref-subtitle' },
          'Choose any favorites with interactive tabs & chips. Leave empty to stay open to everything.'
        )
      ),
      React.createElement('div', { className: 'pref-header-right' },
        React.createElement('div', { className: 'pref-status-indicator' },
          React.createElement('span', { className: 'pref-status-dot' }),
          React.createElement('span', null, `${totalSelected} preference${totalSelected === 1 ? '' : 's'} active`)
        ),
        React.createElement('button', {
          type: 'button',
          className: 'pref-close-btn',
          'aria-label': 'Close preferences',
          onClick: onClose
        },
          React.createElement(Icon, { name: 'close', size: 18 })
        )
      )
    ),

    // 2. Body: Left Navigation Sidebar + Right Content Area
    React.createElement('div', { className: 'pref-body' },
      // Vertical Navigation Sidebar
      React.createElement('nav', { className: 'pref-sidebar', 'aria-label': 'Preference categories' },
        tabs.map(tab => {
          const isSelected = activeTab === tab.id;
          const selectedCount = (preferences[tab.id] || []).length;
          return React.createElement('button', {
            key: tab.id,
            type: 'button',
            className: `pref-nav-item ${isSelected ? 'active' : ''}`,
            onClick: () => {
              setActiveTab(tab.id);
              setSearch('');
              setShowSelectedOnly(false);
            }
          },
            React.createElement('span', { className: 'pref-nav-icon' },
              React.createElement(Icon, { name: tab.icon, size: 16 })
            ),
            React.createElement('span', { className: 'pref-nav-label' }, tab.label),
            React.createElement('span', { className: 'pref-nav-counts' },
              selectedCount > 0 && React.createElement('span', { className: 'pref-nav-selected-pill' }, selectedCount),
              React.createElement('span', { className: 'pref-nav-total-pill' }, tab.count)
            )
          );
        })
      ),

      // Main Content
      React.createElement('div', { className: 'pref-main-content' },
        // Search & Filtering Bar
        React.createElement('div', { className: 'pref-filter-bar' },
          React.createElement('div', { className: 'pref-search-box' },
            React.createElement(Icon, { name: 'search', size: 16, className: 'pref-search-icon' }),
            React.createElement('input', {
              type: 'text',
              className: 'pref-search-input',
              value: search,
              onChange: e => setSearch(e.target.value),
              placeholder: `Search ${currentTabObj.label.toLowerCase()}...`,
              'aria-label': `Search ${currentTabObj.label.toLowerCase()}`
            }),
            search && React.createElement('button', {
              type: 'button',
              className: 'pref-search-clear',
              'aria-label': 'Clear search',
              onClick: () => setSearch('')
            },
              React.createElement(Icon, { name: 'close', size: 13 })
            )
          ),

          React.createElement('label', { className: 'pref-filter-checkbox-label' },
            React.createElement('input', {
              type: 'checkbox',
              checked: showSelectedOnly,
              onChange: e => setShowSelectedOnly(e.target.checked)
            }),
            React.createElement('span', null, 'Show selected only'),
            selectedInCurrentTab.length > 0 && React.createElement('span', { className: 'pref-filter-selected-badge' }, selectedInCurrentTab.length)
          )
        ),

        // Popular for you Section (Only shown when not searching or in showSelectedOnly filter)
        !search && !showSelectedOnly && popularCards.length > 0 && React.createElement('section', { className: 'pref-popular-section' },
          React.createElement('div', { className: 'pref-section-header' },
            React.createElement('h3', { className: 'pref-section-title' }, 'Popular for you')
          ),
          React.createElement('div', { className: 'pref-popular-grid' },
            popularCards.map(item => {
              const isSelected = selectedInCurrentTab.includes(item.name);
              return React.createElement('div', {
                key: item.name,
                className: `pref-popular-card ${isSelected ? 'selected' : ''}`,
                style: { backgroundImage: `url(${item.image})` },
                onClick: () => toggleItem(activeTab, item.name),
                role: 'button',
                tabIndex: 0,
                onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleItem(activeTab, item.name); } }
              },
                React.createElement('div', { className: 'pref-popular-overlay' }),
                React.createElement('div', { className: 'pref-popular-top-action' },
                  React.createElement('button', {
                    type: 'button',
                    className: `pref-popular-btn ${isSelected ? 'selected' : ''}`,
                    'aria-label': `${isSelected ? 'Remove' : 'Add'} ${item.name}`,
                    onClick: (e) => { e.stopPropagation(); toggleItem(activeTab, item.name); }
                  },
                    isSelected
                      ? React.createElement(Icon, { name: 'check', size: 12 })
                      : React.createElement(Icon, { name: 'plus', size: 12 })
                  )
                ),
                React.createElement('span', { className: 'pref-popular-name' }, item.name)
              );
            })
          )
        ),

        // All Items Section (3-Column Grid)
        React.createElement('section', { className: 'pref-all-section' },
          React.createElement('div', { className: 'pref-section-header' },
            React.createElement('h3', { className: 'pref-section-title' }, `All ${currentTabObj.label.toLowerCase()}`),
            React.createElement('span', { className: 'pref-section-count' }, `${filteredItems.length} items`)
          ),

          filteredItems.length === 0
            ? React.createElement('div', { className: 'pref-empty-state' },
                React.createElement('p', null, search ? `No ${currentTabObj.label.toLowerCase()} matching "${search}"` : `No selected ${currentTabObj.label.toLowerCase()} yet.`)
              )
            : React.createElement('div', { className: 'pref-all-grid' },
                filteredItems.map(item => {
                  const isSelected = selectedInCurrentTab.includes(item);
                  return React.createElement('div', {
                    key: item,
                    className: `pref-item-card ${isSelected ? 'selected' : ''}`,
                    onClick: () => toggleItem(activeTab, item),
                    role: 'button',
                    tabIndex: 0,
                    onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleItem(activeTab, item); } }
                  },
                    // Small circular thumbnail / icon
                    React.createElement('div', { className: `pref-item-thumb ${isSelected ? 'selected' : ''}` },
                      React.createElement(Icon, { name: currentTabObj.icon, size: 13 })
                    ),
                    // Item Name
                    React.createElement('span', { className: 'pref-item-name', title: item }, item),
                    // Minimal circular + / checkmark action on right
                    React.createElement('button', {
                      type: 'button',
                      className: `pref-item-action ${isSelected ? 'selected' : ''}`,
                      'aria-label': `${isSelected ? 'Remove' : 'Add'} ${item}`,
                      onClick: (e) => { e.stopPropagation(); toggleItem(activeTab, item); }
                    },
                      isSelected
                        ? React.createElement(Icon, { name: 'check', size: 11 })
                        : React.createElement(Icon, { name: 'plus', size: 11 })
                    )
                  );
                })
              )
        )
      )
    ),

    // 3. Fixed Footer
    React.createElement('div', { className: 'pref-footer' },
      React.createElement('button', {
        type: 'button',
        className: 'pref-footer-reset',
        onClick: resetAll,
        disabled: totalSelected === 0
      }, 'Reset all'),

      React.createElement('div', { className: 'pref-footer-actions' },
        React.createElement('button', {
          type: 'button',
          className: 'pref-footer-cancel',
          onClick: onClose
        }, 'Cancel'),
        React.createElement('button', {
          type: 'button',
          className: 'pref-footer-save',
          onClick: handleSave,
          disabled: saving
        }, saving ? 'Saving preferences…' : 'Save preferences')
      )
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
