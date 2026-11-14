import { FormEvent, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { categories, Condition, Item, ItemDraft, ItemStatus, Order, User } from './types'

type View = 'browse' | 'detail' | 'listing' | 'auth' | 'orders' | 'my-listings' | 'favorites'
type IconName = 'search' | 'heart' | 'user' | 'plus' | 'arrow' | 'pin' | 'bag' | 'check' | 'close' | 'spark'

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>, heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>, plus: <><path d="M12 5v14M5 12h14"/></>, arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>, pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>, bag: <><path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></>, check: <path d="m5 12 4 4L19 6"/>, close: <><path d="m6 6 12 12M18 6 6 18"/></>, spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function readSession(): User | null {
  try { return JSON.parse(localStorage.getItem('campusswap:user') || 'null') as User | null } catch { return null }
}

const visualConfig: Record<string, { emoji: string; className: string; label: string }> = {
  Electronics: { emoji: '🎧', className: 'art-electronics', label: 'ELECTRONICS' },
  Books: { emoji: '📚', className: 'art-books', label: 'READ & REPEAT' },
  'Home & living': { emoji: '💡', className: 'art-home', label: 'MAKE YOUR SPACE' },
  Fashion: { emoji: '👜', className: 'art-fashion', label: 'GOOD STYLE, AGAIN' },
  Sports: { emoji: '🧘', className: 'art-sports', label: 'MOVE WELL' },
  Other: { emoji: '✨', className: 'art-other', label: 'A LITTLE OF EVERYTHING' },
}

function ItemArt({ item, compact = false }: { item: Item; compact?: boolean }) {
  const art = visualConfig[item.category] ?? visualConfig.Other
  return <div className={`item-art ${art.className} ${compact ? 'item-art-compact' : ''}`}>
    {item.imageUrl ? <img src={item.imageUrl} alt={item.title} /> : <>
      <span className="art-kicker">{art.label}</span><span className="art-emoji" aria-hidden="true">{art.emoji}</span>
      <span className="art-orbit art-orbit-one"/><span className="art-orbit art-orbit-two"/>
    </>}
  </div>
}

function ItemCard({ item, favorite, onOpen, onFavorite }: { item: Item; favorite: boolean; onOpen: () => void; onFavorite: () => void }) {
  return <article className="item-card">
    <button className="card-image-button" onClick={onOpen} aria-label={`View ${item.title}`}><ItemArt item={item}/></button>
    <button className={`favorite-button ${favorite ? 'is-favorite' : ''}`} onClick={onFavorite} aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}><Icon name="heart" size={17}/></button>
    <div className="item-card-body">
      <div className="item-card-meta"><span>{item.category}</span><span className="condition-dot">{item.condition}</span></div>
      <button className="item-title-button" onClick={onOpen}>{item.title}</button>
      <div className="item-card-bottom"><strong>HK${item.price.toLocaleString()}</strong><span><Icon name="pin" size={14}/>{item.location}</span></div>
    </div>
  </article>
}

function App() {
  const [view, setView] = useState<View>('browse')
  const [user, setUser] = useState<User | null>(() => api.demoMode ? readSession() : null)
  const [authReady, setAuthReady] = useState(api.demoMode)
  const [items, setItems] = useState<Item[]>([])
  const [myListings, setMyListings] = useState<Item[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [favoriteListings, setFavoriteListings] = useState<Item[]>([])
  const [activeItem, setActiveItem] = useState<Item | null>(null)
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [query, setQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [category, setCategory] = useState('All items')
  const [condition, setCondition] = useState('Any condition')
  const [status, setStatus] = useState<ItemStatus>('available')
  const [minPriceInput, setMinPriceInput] = useState('')
  const [maxPriceInput, setMaxPriceInput] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [mobileMenu, setMobileMenu] = useState(false)

  async function refresh() {
    if (!authReady) return
    setLoading(true)
    try {
      const [nextItems, nextOrders, nextFavorites] = await Promise.all([
        api.getItems({ search: query, category, condition, minPrice, maxPrice, status }),
        user ? api.getOrders() : Promise.resolve([]),
        user ? api.getFavoriteItems() : Promise.resolve([]),
      ])
      const owned = user ? await api.getMyItems(user) : []
      setItems(nextItems); setMyListings(owned); setOrders(nextOrders)
      setFavoriteListings(nextFavorites); setFavorites(nextFavorites.map((item) => item.id)); setError('')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load CampusSwap.'); }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (api.demoMode) return
    let active = true
    void api.currentUser().then((current) => {
      if (!active) return
      setUser(current)
      setAuthReady(true)
    })
    return () => { active = false }
  }, [])
  useEffect(() => { if (authReady) void refresh() }, [authReady, query, category, condition, minPrice, maxPrice, status, user?.id, view])
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 3200); return () => window.clearTimeout(timer) }, [notice])

  const myItems = myListings
  const favoriteItems = favoriteListings
  const myOrders = useMemo(() => orders.filter((order) => order.buyerId === user?.id || order.sellerId === user?.id), [orders, user])
  const unreadCount = myOrders.filter((order) => order.sellerId === user?.id && order.status === 'pending').length

  function openAuth(mode: 'login' | 'register' = 'login') { setAuthMode(mode); setView('auth'); setMobileMenu(false) }
  function goBrowse() { setView('browse'); setActiveItem(null); setEditingItem(null); setMobileMenu(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function openItem(item: Item) { setError(''); setActiveItem(item); setView('detail'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function openListing(item?: Item) { if (!user) return openAuth(); setEditingItem(item ?? null); setView('listing'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  async function toggleFavorite(item: Item) {
    if (!user) return openAuth()
    const active = favorites.includes(item.id)
    if (!active && item.status !== 'available') {
      setError('Only available listings can be added to favorites.')
      return
    }
    try {
      await api.toggleFavorite(item.id, active)
      setFavorites((current) => active ? current.filter((favorite) => favorite !== item.id) : [...current, item.id])
      setFavoriteListings((current) => active ? current.filter((favorite) => favorite.id !== item.id) : [item, ...current.filter((favorite) => favorite.id !== item.id)])
      setNotice(active ? 'Removed from your saved items.' : 'Saved for later.')
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update favorite.') }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    const form = new FormData(event.currentTarget)
    try {
      const nextUser = authMode === 'register'
        ? await api.register(String(form.get('fullName')), String(form.get('email')), String(form.get('password')))
        : await api.login(String(form.get('email')), String(form.get('password')))
      setUser(nextUser)
      if (api.demoMode) localStorage.setItem('campusswap:user', JSON.stringify(nextUser))
      else localStorage.removeItem('campusswap:user')
      setNotice(`Welcome${authMode === 'register' ? ' to CampusSwap' : ' back'}, ${nextUser.fullName.split(' ')[0]}.`); goBrowse()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not sign you in.') }
  }

  async function submitListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!user) return openAuth(); setError('')
    const form = new FormData(event.currentTarget)
    const draft: ItemDraft = { title: String(form.get('title')).trim(), description: String(form.get('description')).trim(), price: Number(form.get('price')), condition: String(form.get('condition')) as Condition, category: String(form.get('category')), location: String(form.get('location')).trim(), imageUrl: String(form.get('imageUrl')).trim() }
    try { await api.saveItem(draft, user, editingItem?.id); setNotice(editingItem ? 'Your listing has been updated.' : 'Your item is live. Good things find new homes.'); setView('my-listings'); setEditingItem(null); await refresh() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save your listing.') }
  }

  async function deleteItem(item: Item) {
    if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return
    try {
      await api.deleteItem(item.id)
      setActiveItem(null)
      setMyListings((current) => current.filter((listing) => listing.id !== item.id))
      setNotice('Listing removed.')
      if (view === 'my-listings') await refresh()
      else setView('my-listings')
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not delete listing.') }
  }

  async function placeOrder() {
    if (!user || !activeItem) return openAuth()
    if (activeItem.sellerId === user.id) return setError('You cannot order your own listing.')
    try { await api.placeOrder(activeItem, user, activeItem.location); setNotice('Order request sent. The seller can confirm it in their orders.'); setActiveItem(null); setView('orders'); await refresh() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not place the order.') }
  }

  async function changeOrder(order: Order, status: Order['status']) {
    try { await api.updateOrder(order, status); setNotice(status === 'confirmed' ? 'Order confirmed.' : status === 'completed' ? 'Exchange marked complete.' : 'Order cancelled.'); await refresh() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update the order.') }
  }

  async function signOut() {
    try { await api.logout() } catch { /* Clear the local view even when a session has expired. */ }
    setUser(null); localStorage.removeItem('campusswap:user'); setView('browse'); setNotice('You are signed out.')
  }

  function runSearch(event: FormEvent) { event.preventDefault(); setQuery(searchInput.trim()); setView('browse') }

  function applyPriceFilter(event: FormEvent) {
    event.preventDefault()
    const nextMin = minPriceInput.trim()
    const nextMax = maxPriceInput.trim()
    if (nextMin && nextMax && Number(nextMin) > Number(nextMax)) {
      setError('Minimum price cannot be greater than maximum price.')
      return
    }
    setMinPrice(nextMin)
    setMaxPrice(nextMax)
    setError('')
  }

  function clearFilters() {
    setQuery('')
    setSearchInput('')
    setCategory('All items')
    setCondition('Any condition')
    setStatus('available')
    setMinPriceInput('')
    setMaxPriceInput('')
    setMinPrice('')
    setMaxPrice('')
    setError('')
  }

  const filtersActive = Boolean(query || category !== 'All items' || condition !== 'Any condition' ||
    minPrice || maxPrice || status !== 'available')

  return <div className="app-shell">
    <header className="site-header">
      <div className="header-inner">
        <button className="brand" onClick={goBrowse} aria-label="CampusSwap home"><span className="brand-mark"><span/><span/><span/></span><span>campus<span className="brand-light">swap</span></span></button>
        <form className="header-search" onSubmit={runSearch}><Icon name="search" size={18}/><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Find something good…" aria-label="Search listings"/><button type="submit">Search</button></form>
        <nav className={`header-actions ${mobileMenu ? 'menu-open' : ''}`}>
          {user && <><button className={`nav-link ${view === 'favorites' ? 'active' : ''}`} onClick={() => setView('favorites')}><Icon name="heart" size={17}/><span>Saved</span></button><button className={`nav-link ${view === 'orders' ? 'active' : ''}`} onClick={() => setView('orders')}><Icon name="bag" size={17}/><span>Orders</span>{unreadCount > 0 && <i className="nav-count">{unreadCount}</i>}</button></>}
          <button className="sell-button" onClick={() => openListing()}><Icon name="plus" size={17}/><span>Sell an item</span></button>
          {user ? <div className="account-wrap"><button className="account-button" onClick={() => setView(view === 'my-listings' ? 'browse' : 'my-listings')} aria-label="Your account"><span className="avatar">{user.fullName.charAt(0).toUpperCase()}</span><span className="account-name">{user.fullName.split(' ')[0]}</span></button><button className="signout-link" onClick={() => void signOut()}>Sign out</button></div> : <button className="signin-button" onClick={() => openAuth()}>Sign in</button>}
        </nav>
        <button className="mobile-menu-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle menu"><span/><span/></button>
      </div>
    </header>

    <main>
      {view === 'browse' && <>
        <section className="hero-wrap"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line"/>HKU’S CAMPUS MARKETPLACE</div><h1>Good things<br/>find <em>new homes.</em></h1><p>Buy and sell the things you love, right here on campus. Better for your wallet, and a little kinder to the planet.</p><div className="hero-ctas"><button className="primary-button" onClick={() => document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' })}>Explore the marketplace <Icon name="arrow" size={16}/></button><button className="text-button" onClick={() => openListing()}>Sell an item ↗</button></div><div className="hero-proof"><div className="proof-avatars"><span>M</span><span>J</span><span>A</span><span>+</span></div><span>A little community that gets it.</span></div></div><div className="hero-art"><div className="hero-sun"/><div className="hero-sticker">GOOD<br/>GOES<br/>AROUND <span>↗</span></div><div className="hero-object hero-headphones">🎧</div><div className="hero-object hero-book">📚</div><div className="hero-object hero-mug">☕</div><div className="hero-caption"><span>01 / 03</span><span>Second-hand, first choice.</span></div></div></section>
        <section className="trust-strip"><div><strong>Made for HKU</strong><span>Find it nearby, meet up on campus.</span></div><div><strong>Good finds, fair prices</strong><span>Great things deserve a second chapter.</span></div><div><strong>Keep it in circulation</strong><span>Small swaps, a lighter footprint.</span></div><span className="trust-spark"><Icon name="spark" size={25}/></span></section>
        <section id="marketplace" className="marketplace-section"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>THE GOOD STUFF</div><h2>Find your <em>next favourite.</em></h2></div><span className="section-note">A few things looking for a new home <span>✳</span></span></div>
          <div className="browse-tools">
            <div className="category-list">{categories.map((entry) => <button key={entry} className={`category-chip ${category === entry ? 'selected' : ''}`} onClick={() => setCategory(entry)}>{entry === 'All items' ? 'Everything' : entry}</button>)}</div>
            <div className="quick-filters">
              <label className="condition-filter"><span>Condition</span><select value={condition} onChange={(event) => setCondition(event.target.value)}><option>Any condition</option><option>New</option><option>Like new</option><option>Good</option><option>Fair</option></select></label>
              <label className="condition-filter"><span>Availability</span><select value={status} onChange={(event) => setStatus(event.target.value as ItemStatus)}><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option><option value="removed">Removed</option></select></label>
            </div>
          </div>
          <form className="price-filter" onSubmit={applyPriceFilter}>
            <span className="price-filter-title">PRICE RANGE</span>
            <label>HK$<input type="number" min="0" step="0.01" inputMode="decimal" placeholder="Min" value={minPriceInput} onChange={(event) => setMinPriceInput(event.target.value)} aria-label="Minimum price"/></label>
            <span className="price-separator">to</span>
            <label>HK$<input type="number" min="0" step="0.01" inputMode="decimal" placeholder="Max" value={maxPriceInput} onChange={(event) => setMaxPriceInput(event.target.value)} aria-label="Maximum price"/></label>
            <button className="filter-button" type="submit">Apply</button>
            {filtersActive && <button className="filter-reset" type="button" onClick={clearFilters}>Clear all</button>}
          </form>
          {filtersActive && <div className="results-label">{query ? <>Showing results for <strong>“{query}”</strong></> : <>Showing <strong>filtered</strong> listings</>}<button onClick={clearFilters}>Clear filters</button></div>}
          {error && <div className="inline-alert" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><Icon name="close" size={16}/></button></div>}
          {loading ? <div className="loading-grid">{[1,2,3,4].map((n) => <div className="skeleton-card" key={n}><div/><span/><span/></div>)}</div> : items.length ? <div className="item-grid">{items.map((item) => <ItemCard key={item.id} item={item} favorite={favorites.includes(item.id)} onOpen={() => openItem(item)} onFavorite={() => void toggleFavorite(item)}/>)}</div> : <div className="empty-state"><span className="empty-icon">⌕</span><h3>Nothing here just yet.</h3><p>Try another search, price range or category. The next great find is out there.</p><button className="secondary-button" onClick={clearFilters}>Show everything</button></div>}
          <div className="browse-bottom"><span>Showing <strong>{items.length}</strong> good {items.length === 1 ? 'thing' : 'things'}</span><button className="subtle-link" onClick={() => openListing()}>List something of your own <Icon name="arrow" size={15}/></button></div>
        </section>
        <section className="seller-callout"><div className="callout-orbit">↗</div><div><div className="eyebrow">A LITTLE CLEARING OUT?</div><h2>Make space for<br/><em>what’s next.</em></h2><p>Your old favourite could be someone else’s new one.</p></div><button className="light-button" onClick={() => openListing()}>List an item <Icon name="arrow" size={16}/></button></section>
      </>}

      {view === 'detail' && activeItem && <section className="content-page detail-page">{error && <div className="inline-alert" role="alert">{error}</div>}<button className="back-link" onClick={goBrowse}>← Back to the marketplace</button><div className="detail-layout"><div className="detail-image"><ItemArt item={activeItem}/><div className="image-index">01 <span>/</span> 01</div></div><div className="detail-info"><div className="eyebrow"><span className="eyebrow-line"/>{activeItem.category.toUpperCase()}</div><div className="detail-title-row"><h1>{activeItem.title}</h1><button className={`detail-heart ${favorites.includes(activeItem.id) ? 'is-favorite' : ''}`} onClick={() => void toggleFavorite(activeItem)} aria-label="Save item"><Icon name="heart" size={20}/></button></div><div className="detail-price">HK${activeItem.price.toLocaleString()} <span>· {activeItem.condition}</span></div><p className="detail-description">{activeItem.description}</p><div className="seller-card"><span className="avatar avatar-large">{activeItem.sellerName.charAt(0)}</span><div><strong>{activeItem.sellerName}</strong><span>HKU community member</span></div><span className="seller-verified"><Icon name="check" size={15}/> Campus</span></div><div className="detail-location"><Icon name="pin" size={17}/><div><strong>Meet up around campus</strong><span>{activeItem.location}</span></div></div>{user?.id === activeItem.sellerId ? <div className="detail-actions"><button className="primary-button" onClick={() => openListing(activeItem)}>Edit your listing <Icon name="arrow" size={16}/></button><button className="secondary-button" onClick={() => void deleteItem(activeItem)}>Delete listing</button></div> : <><button className="primary-button order-cta" onClick={() => void placeOrder()} disabled={activeItem.status !== 'available'}>{activeItem.status === 'available' ? 'Request to buy' : 'No longer available'} <Icon name="arrow" size={16}/></button><p className="safe-note">No payment needed here. Arrange a safe campus meetup directly.</p></>}</div></div></section>}

      {view === 'auth' && <section className="auth-page"><div className="auth-art"><div className="auth-art-mark">↗</div><span className="eyebrow">GOOD THINGS GO AROUND</span><h2>Make room for<br/><em>a new favourite.</em></h2><p>A more thoughtful way to find what you need, and pass on what you don't.</p><span className="auth-art-bottom">A marketplace for the HKU community.</span></div><div className="auth-form-wrap"><button className="back-link" onClick={goBrowse}>← Back to browsing</button><div className="auth-form-inner"><div className="eyebrow"><span className="eyebrow-line"/>{authMode === 'login' ? 'WELCOME BACK' : 'JOIN THE COMMUNITY'}</div><h1>{authMode === 'login' ? 'Good to see you.' : 'Make yourself at home.'}</h1><p className="auth-intro">{authMode === 'login' ? 'Sign in to save finds and manage your listings.' : 'One small step towards a better kind of shopping.'}</p><form onSubmit={submitAuth} className="stacked-form">{authMode === 'register' && <label>Your name<input name="fullName" autoComplete="name" placeholder="e.g. Alex Chan" required/></label>}<label>HKU email<input name="email" type="email" autoComplete="email" placeholder="you@connect.hku.hk" required/></label><label>Password<input name="password" type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} placeholder={authMode === 'login' ? 'Your password' : '8–72 bytes'} minLength={authMode === 'register' ? 8 : 1} maxLength={72} required/></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-button full-button" type="submit">{authMode === 'login' ? 'Sign in' : 'Create account'} <Icon name="arrow" size={16}/></button></form><p className="auth-switch">{authMode === 'login' ? 'New around here?' : 'Already part of the community?'} <button onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setError('') }}>{authMode === 'login' ? 'Create an account' : 'Sign in'}</button></p>{api.demoMode && <div className="demo-note"><span className="demo-dot"/> Demo mode is on. Any email and password work for sign in.</div>}</div></div></section>}

      {view === 'listing' && <section className="content-page form-page"><button className="back-link" onClick={() => setView('my-listings')}>← Back to your listings</button><div className="form-page-header"><div className="eyebrow"><span className="eyebrow-line"/>{editingItem ? 'MAKE IT YOURS' : 'PASS IT ON'}</div><h1>{editingItem ? 'A little update.' : 'Give it a new chapter.'}</h1><p>{editingItem ? 'Keep the details fresh so the right person can find it.' : 'A few details help the next person find their new favourite.'}</p></div><form onSubmit={submitListing} className="listing-form"><div className="form-main"><label>What are you selling?<input name="title" defaultValue={editingItem?.title} placeholder="e.g. Sony headphones in great condition" maxLength={120} required/></label><label>Tell us a little about it<textarea name="description" defaultValue={editingItem?.description} placeholder="Condition, what’s included, why you loved it…" rows={5} maxLength={1200} required/></label><div className="form-two-columns"><label>Price <span className="input-prefix"><b>HK$</b><input name="price" type="number" min="0" step="0.01" defaultValue={editingItem?.price} placeholder="0.00" required/></span></label><label>Condition<select name="condition" defaultValue={editingItem?.condition ?? 'Good'}><option>New</option><option>Like new</option><option>Good</option><option>Fair</option></select></label></div><div className="form-two-columns"><label>Category<select name="category" defaultValue={editingItem?.category ?? 'Electronics'}>{categories.slice(1).map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>Meetup location<input name="location" defaultValue={editingItem?.location} placeholder="e.g. Main Library" required/></label></div><label>Photo URL <span className="optional-label">OPTIONAL</span><input name="imageUrl" type="url" defaultValue={editingItem?.imageUrl} placeholder="https://…"/></label><div className="privacy-hint"><Icon name="pin" size={17}/><span>Keep it public and simple: use a campus landmark, not your room number.</span></div></div><aside className="form-aside"><div className="preview-card"><div className="preview-placeholder"><span>{editingItem ? <ItemArt item={editingItem}/> : '✳'}</span></div><div className="preview-copy"><span>YOUR LISTING</span><strong>{editingItem?.title || 'Your item title'}</strong><small>HKU campus · Good things find new homes</small></div></div><div className="form-tip"><span>✳</span><div><strong>A good listing goes a long way.</strong><p>Clear details and an honest condition help everyone feel good about the swap.</p></div></div></aside><div className="form-footer">{error && <div className="form-error" role="alert">{error}</div>}<button className="secondary-button" type="button" onClick={() => setView('my-listings')}>Cancel</button><button className="primary-button" type="submit">{editingItem ? 'Save changes' : 'Publish listing'} <Icon name="arrow" size={16}/></button></div></form></section>}

      {view === 'my-listings' && <section className="content-page dashboard-page"><PageHeader eyebrow="YOUR LITTLE CORNER" title="Your listings." description="Keep an eye on the things you’ve passed along." action={<button className="primary-button" onClick={() => openListing()}><Icon name="plus" size={16}/> New listing</button>}/>{error && <div className="inline-alert"><span>{error}</span><button onClick={() => setError('')}><Icon name="close" size={16}/></button></div>}{myItems.length ? <div className="dashboard-list">{myItems.map((item) => <div className="dashboard-item" key={item.id}><ItemArt item={item} compact/><div className="dashboard-item-main"><div><strong>{item.title}</strong><span>{item.category} · {item.condition}</span></div><span className={`status-pill status-${item.status}`}>{item.status}</span></div><strong className="dashboard-price">HK${item.price.toLocaleString()}</strong><div className="dashboard-actions"><button onClick={() => openListing(item)}>Edit</button><button onClick={() => void deleteItem(item)}>Delete</button></div></div>)}</div> : <EmptyPanel title="Your first listing starts here." text="That book, lamp or pair of headphones could be someone else’s next favourite." button="List your first item" onClick={() => openListing()}/>}</section>}

      {view === 'favorites' && <section className="content-page dashboard-page"><PageHeader eyebrow="SAVED FOR LATER" title="The ones you love." description="A little shortlist of things you might want to bring home." action={<button className="secondary-button" onClick={goBrowse}>Back to browsing <Icon name="arrow" size={15}/></button>}/>{error && <div className="inline-alert"><span>{error}</span><button onClick={() => setError('')}><Icon name="close" size={16}/></button></div>}{favoriteItems.length ? <div className="item-grid">{favoriteItems.map((item) => <ItemCard key={item.id} item={item} favorite onOpen={() => openItem(item)} onFavorite={() => void toggleFavorite(item)}/>)}</div> : <EmptyPanel title="Keep the good ones close." text="Tap the heart on a listing and it’ll be waiting here when you’re ready." button="Browse the marketplace" onClick={goBrowse}/>}</section>}

      {view === 'orders' && <section className="content-page dashboard-page"><PageHeader eyebrow="A GOOD THING IN MOTION" title="Your swaps." description="The little details that help a good find find its way home." action={null}/>{error && <div className="inline-alert"><span>{error}</span><button onClick={() => setError('')}><Icon name="close" size={16}/></button></div>}{myOrders.length ? <div className="orders-list">{myOrders.map((order) => { const isSeller = order.sellerId === user?.id; return <article className="order-card" key={order.id}><div className="order-card-top"><div className="order-item-icon">{order.itemImage ? <img src={order.itemImage} alt=""/> : '✳'}</div><div className="order-item-heading"><span>{isSeller ? 'INCOMING REQUEST' : 'YOUR REQUEST'}</span><strong>{order.itemTitle}</strong><small>{isSeller ? `From ${order.buyerName}` : `Seller · ${order.sellerName}`}</small></div><span className={`status-pill status-${order.status}`}>{order.status}</span></div><div className="order-card-meta"><span><Icon name="pin" size={15}/>{order.pickupLocation}</span><strong>HK${order.agreedAmount.toLocaleString()}</strong></div><div className="order-card-actions">{order.status === 'pending' && (isSeller ? <><button className="primary-button small-button" onClick={() => void changeOrder(order, 'confirmed')}>Confirm request <Icon name="check" size={15}/></button><button className="text-button" onClick={() => void changeOrder(order, 'cancelled')}>Decline</button></> : <button className="text-button" onClick={() => void changeOrder(order, 'cancelled')}>Cancel request</button>)}{order.status === 'confirmed' && isSeller && <button className="primary-button small-button" onClick={() => void changeOrder(order, 'completed')}>Mark exchange complete <Icon name="check" size={15}/></button>}{order.status === 'confirmed' && !isSeller && <span className="order-hint">The seller confirmed — arrange your campus meetup.</span>}{order.status === 'completed' && <span className="order-hint completed-hint"><Icon name="check" size={15}/> This swap found its new home.</span>}</div></article> })}</div> : <EmptyPanel title="Your next good find is out there." text="When you request an item or someone wants one of yours, the details will show up here." button="Find something good" onClick={goBrowse}/>}</section>}
    </main>

    <footer className="site-footer"><div className="footer-top"><button className="brand footer-brand" onClick={goBrowse}><span className="brand-mark"><span/><span/><span/></span><span>campus<span className="brand-light">swap</span></span></button><span>Good things find new homes.</span><button className="footer-sell" onClick={() => openListing()}>Have something to pass on? <span>Sell an item ↗</span></button></div><div className="footer-bottom"><span>Made for the HKU community · 2026</span><span>Keep good things going <b>✳</b></span></div></footer>
    {notice && <div className="toast" role="status"><span className="toast-check"><Icon name="check" size={15}/></span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><Icon name="close" size={15}/></button></div>}
  </div>
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action: React.ReactNode }) {
  return <div className="page-header-row"><div><div className="eyebrow"><span className="eyebrow-line"/>{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function EmptyPanel({ title, text, button, onClick }: { title: string; text: string; button: string; onClick: () => void }) {
  return <div className="empty-state"><span className="empty-icon">✳</span><h3>{title}</h3><p>{text}</p><button className="secondary-button" onClick={onClick}>{button} <Icon name="arrow" size={15}/></button></div>
}

export default App
