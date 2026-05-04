import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bell,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Gauge,
  Layers3,
  ListChecks,
  MailCheck,
  Menu,
  PanelRightOpen,
  Pause,
  Play,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tags,
  Waypoints,
  Zap,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button, ChipSet, FilterChip, Slider, Switch } from '../ui/primitives';

const spotlightItems = [
  {
    title: 'Priority narrative',
    meta: 'Today · 3 active signals',
    body: 'Turn mail, token and runtime events into one readable command story.',
    icon: Sparkles,
    accent: 'primary',
  },
  {
    title: 'Human-in-loop AI',
    meta: 'AI · Review before action',
    body: 'Draft, explain and route decisions while keeping final control visible.',
    icon: Bot,
    accent: 'tertiary',
  },
  {
    title: 'Runtime topology',
    meta: 'Proxy · Integrations · Sync',
    body: 'Show service health, sync paths and recovery states as live product surfaces.',
    icon: Waypoints,
    accent: 'secondary',
  },
];

const chips = ['Spotlight', 'Material 3', 'Motion', 'Adaptive UI'];
const motionModes = ['Expressive', 'Standard', 'Focused'] as const;
const componentModes = ['Actions', 'Progress', 'Navigation'] as const;
const atlasModes = ['Search', 'Sheets', 'Lists', 'Inputs'] as const;
const atlasRows = [
  { title: 'Search results', meta: 'Search · 12 entities', icon: Search, tone: 'primary' },
  { title: 'Review checklist', meta: 'List · 4 pending', icon: ListChecks, tone: 'secondary' },
  { title: 'Policy reminder', meta: 'Badge · Needs approval', icon: ShieldCheck, tone: 'tertiary' },
];

export function SpotlightDeck() {
  const [motionMode, setMotionMode] = useState<(typeof motionModes)[number]>('Expressive');
  const [componentMode, setComponentMode] = useState<(typeof componentModes)[number]>('Actions');
  const [atlasMode, setAtlasMode] = useState<(typeof atlasModes)[number]>('Search');
  const [intensity, setIntensity] = useState(72);
  const [liveMotion, setLiveMotion] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const labStyle = useMemo(
    () => ({ '--muse-motion-intensity': `${0.82 + intensity / 420}` } as CSSProperties),
    [intensity]
  );

  return (
    <section className="muse-spotlight-deck" aria-label="Muse Spotlight">
      <div className="muse-spotlight-lead dynamic-block">
        <div className="muse-spotlight-kicker">
          <Sparkles className="h-4 w-4" />
          Google Design Spotlight
        </div>
        <h2 className="muse-spotlight-title">Design signals for the current workspace</h2>
        <p className="muse-spotlight-copy">
          A global editorial layer for surfacing what changed, why it matters, and which action should come next.
        </p>
        <ChipSet className="mt-5">
          {chips.map((chip, index) => (
            <FilterChip key={chip} selected={index === 0} className="material-chip">
              {chip}
            </FilterChip>
          ))}
        </ChipSet>
      </div>

      <div className="muse-spotlight-grid">
        {spotlightItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.article
              key={item.title}
              className="muse-spotlight-card dynamic-block"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ delay: index * 0.06, duration: 0.34, ease: [0.2, 0, 0, 1] }}
              data-accent={item.accent}
            >
              <div className="muse-spotlight-mark" aria-hidden="true">
                <Icon className="h-5 w-5" />
              </div>
              <div className="muse-spotlight-card-meta">{item.meta}</div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <div className="muse-spotlight-card-actions">
                <Button variant={index === 0 ? 'filled' : 'tonal'}>
                  <MailCheck className="mr-2 h-4 w-4" />
                  Inspect
                </Button>
                <Button variant="text">
                  <Layers3 className="mr-2 h-4 w-4" />
                  Layer
                </Button>
              </div>
            </motion.article>
          );
        })}
      </div>

      <Link className="muse-spotlight-link md3-state-layer" to="/today">
        Open command spotlight
        <ArrowRight className="h-4 w-4" />
      </Link>

      <div className="muse-expressive-lab" data-motion={motionMode.toLowerCase()} style={labStyle}>
        <div className="muse-expressive-toolbar">
          <div>
            <div className="muse-spotlight-kicker">
              <Zap className="h-4 w-4" />
              M3 Expressive components
            </div>
            <h3>Motion physics and component density</h3>
          </div>
          <div className="muse-expressive-actions">
            <div className="muse-button-group" role="group" aria-label="Motion scheme">
              {motionModes.map((mode) => (
                <button key={mode} type="button" data-selected={motionMode === mode} onClick={() => setMotionMode(mode)}>
                  {mode}
                </button>
              ))}
            </div>
            <Button
              variant="tonal"
              onClick={() => {
                setLiveMotion((value) => !value);
                toast(liveMotion ? 'Motion paused' : 'Motion resumed');
              }}
            >
              {liveMotion ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
              {liveMotion ? 'Pause' : 'Resume'}
            </Button>
          </div>
        </div>

        <div className="muse-expressive-grid">
          <motion.div
            className="muse-motion-stage"
            animate={liveMotion ? { scale: [1, 1.018, 1], borderRadius: ['28px', '40px', '28px'] } : { scale: 1 }}
            transition={{ repeat: liveMotion ? Infinity : 0, duration: 2.2, ease: [0.2, 0, 0, 1] }}
          >
            <div className="muse-motion-chip">Spatial spring</div>
            <div className="muse-motion-object">
              <Sparkles className="h-6 w-6" />
            </div>
            <p>Position, size and shape animate with a lively spatial scheme.</p>
          </motion.div>

          <div className="muse-component-console">
            <div className="muse-button-group muse-button-group-wide" role="group" aria-label="Component mode">
              {componentModes.map((mode) => (
                <button key={mode} type="button" data-selected={componentMode === mode} onClick={() => setComponentMode(mode)}>
                  {mode}
                </button>
              ))}
            </div>
            <div className="muse-split-action">
              <Button variant="filled">
                <MailCheck className="mr-2 h-4 w-4" />
                Run review
              </Button>
              <button type="button" className="muse-split-menu" aria-label="More review actions">
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            <div className="muse-fab-menu-preview" aria-label="FAB menu preview">
              <button type="button" aria-label="Notify">
                <Bell className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Tune">
                <Gauge className="h-4 w-4" />
              </button>
              <button type="button" className="muse-fab-menu-root" aria-label="Primary action">
                <Zap className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="muse-effects-panel">
            <div className="muse-effects-row">
              <span>Live motion</span>
              <Switch checked={liveMotion} onChange={() => setLiveMotion((value) => !value)} />
            </div>
            <div className="muse-effects-row muse-effects-row-stack">
              <span>Effect intensity</span>
              <Slider value={intensity} min={20} max={100} onChange={setIntensity} />
            </div>
            <div className="muse-loading-strip" aria-label="Loading indicator preview">
              <span />
              <span />
              <span />
            </div>
            <div className="muse-progress-meter" aria-label="Progress indicator preview">
              <span style={{ width: `${intensity}%` }} />
            </div>
          </div>
        </div>

        <div className="muse-component-atlas" aria-label="Material component atlas">
          <div className="muse-atlas-header">
            <div>
              <div className="muse-spotlight-kicker">
                <Tags className="h-4 w-4" />
                Component coverage
              </div>
              <h3>Search, sheets, menus, badges, lists and inputs</h3>
            </div>
            <div className="muse-button-group" role="group" aria-label="Atlas mode">
              {atlasModes.map((mode) => (
                <button key={mode} type="button" data-selected={atlasMode === mode} onClick={() => setAtlasMode(mode)}>
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="muse-atlas-grid">
            <div className="muse-search-panel">
              <label className="muse-search-field">
                <Search className="h-4 w-4" />
                <input placeholder="Search commands, routes, messages" aria-label="Search commands" />
                <kbd>/</kbd>
              </label>
              <div className="muse-atlas-tabs" role="tablist" aria-label="Result tabs">
                {['All', 'Mail', 'Runtime'].map((tab, index) => (
                  <button key={tab} type="button" role="tab" aria-selected={index === 0}>
                    {tab}
                    {index === 1 && <span className="muse-badge">8</span>}
                  </button>
                ))}
              </div>
              <div className="muse-atlas-list">
                {atlasRows.map((row) => {
                  const Icon = row.icon;
                  return (
                    <button key={row.title} type="button" className="muse-atlas-row">
                      <span className="muse-atlas-row-icon" data-tone={row.tone}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>
                        <strong>{row.title}</strong>
                        <small>{row.meta}</small>
                      </span>
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="muse-sheet-panel">
              <div className="muse-sheet-preview">
                <div className="muse-side-sheet">
                  <PanelRightOpen className="h-4 w-4" />
                  <strong>Side sheet</strong>
                  <small>Secondary context anchored to the command surface.</small>
                </div>
                <div className="muse-bottom-sheet">
                  <span />
                  <strong>Bottom sheet</strong>
                  <small>Mobile action review</small>
                </div>
              </div>
              <div className="muse-atlas-actions">
                <Button variant="filled" onClick={() => setSheetOpen(true)}>
                  <PanelRightOpen className="mr-2 h-4 w-4" />
                  Open sheet
                </Button>
                <div className="muse-menu-wrap">
                  <Button variant="tonal" onClick={() => setMenuOpen((value) => !value)}>
                    <Menu className="mr-2 h-4 w-4" />
                    Menu
                  </Button>
                  {menuOpen && (
                    <div className="muse-pop-menu" role="menu">
                      <button type="button" role="menuitem"><Star className="h-4 w-4" /> Pin</button>
                      <button type="button" role="menuitem"><Clock3 className="h-4 w-4" /> Snooze</button>
                      <button type="button" role="menuitem"><CircleAlert className="h-4 w-4" /> Escalate</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="muse-input-panel">
              <div className="muse-date-card">
                <CalendarClock className="h-5 w-5" />
                <span>
                  <strong>Review window</strong>
                  <small>Today · 16:30</small>
                </span>
              </div>
              <div className="muse-check-list">
                {['Confirm source', 'Run sync', 'Notify owner'].map((item, index) => (
                  <label key={item}>
                    <input type="checkbox" defaultChecked={index < 2} />
                    <span><CheckCircle2 className="h-4 w-4" />{item}</span>
                  </label>
                ))}
              </div>
              <div className="muse-tooltip-target">
                <SlidersHorizontal className="h-4 w-4" />
                Tune density
                <span className="muse-tooltip">Tooltips label compact controls without crowding the UI.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {sheetOpen && (
        <motion.div
          className="muse-sheet-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setSheetOpen(false)}
        >
          <motion.aside
            className="muse-live-sheet"
            initial={{ opacity: 0, x: 48, y: 18 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 36 }}
            transition={{ duration: 0.26, ease: [0.2, 0, 0, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="muse-spotlight-kicker">
              <PanelRightOpen className="h-4 w-4" />
              Sheet
            </div>
            <h3>Context actions</h3>
            <p>Sheets carry secondary decisions without taking over the full task flow.</p>
            <div className="muse-live-sheet-actions">
              <Button variant="text" onClick={() => setSheetOpen(false)}>Close</Button>
              <Button variant="filled" onClick={() => { setSheetOpen(false); toast('Sheet action applied'); }}>Apply</Button>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </section>
  );
}
