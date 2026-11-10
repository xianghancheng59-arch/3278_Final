import { Item, ItemDraft, Order, User, categories, conditionToApi, itemFromApi, orderFromApi } from './types'

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const DEMO_ITEMS = 'campusswap:items:v1'
const DEMO_ORDERS = 'campusswap:orders:v1'
const DEMO_FAVORITES = 'campusswap:favorites:v1'
let csrfToken: string | null = null
let categoryCache: Array<{ id: string; name: string }> | null = null

const seedItems: Item[] = [
  { id: '101', sellerId: 'u2', sellerName: 'Mia Chen', categoryId: '2', category: 'Electronics', title: 'Sony WH-1000XM4 headphones', description: 'Really good noise cancelling headphones, perfect for the library. Comes with the case and charging cable. Lightly used for one semester.', price: 1180, condition: 'Like new', status: 'available', location: 'Main Library', imageUrl: '', createdAt: '2026-11-02T10:00:00Z' },
  { id: '102', sellerId: 'u3', sellerName: 'Ethan Lau', categoryId: '1', category: 'Textbooks', title: 'The Design of Everyday Things', description: 'A classic design book in great condition. No highlighting or notes. Edition 2013.', price: 95, condition: 'Good', status: 'available', location: 'Centennial Campus', imageUrl: '', createdAt: '2026-11-01T08:00:00Z' },
  { id: '103', sellerId: 'u4', sellerName: 'Lily Wong', categoryId: '4', category: 'Dorm supplies', title: 'Minimal desk lamp', description: 'Warm light, three brightness levels and a USB-C charging port. Moving out so this one needs a new home.', price: 160, condition: 'Good', status: 'available', location: 'Jockey Club Student Village', imageUrl: '', createdAt: '2026-10-31T12:00:00Z' },
  { id: '104', sellerId: 'u5', sellerName: 'Noah Lee', categoryId: '3', category: 'Stationery', title: 'Vintage canvas tote', description: 'A sturdy everyday tote with lots of room for your laptop and books. Washed and ready to go.', price: 45, condition: 'Like new', status: 'available', location: 'Main Building', imageUrl: '', createdAt: '2026-10-30T09:00:00Z' },
  { id: '105', sellerId: 'u6', sellerName: 'Sophie Ng', categoryId: '5', category: 'Sports', title: 'Yoga mat · sage green', description: '6mm non-slip yoga mat. Used a handful of times and still in excellent shape.', price: 110, condition: 'Like new', status: 'available', location: 'Centennial Campus', imageUrl: '', createdAt: '2026-10-29T15:00:00Z' },
  { id: '106', sellerId: 'u7', sellerName: 'Leo Chan', categoryId: '2', category: 'Electronics', title: 'Mechanical keyboard, 75%', description: 'Hot-swappable brown switches with a compact layout. Sounds lovely, works perfectly.', price: 420, condition: 'Good', status: 'available', location: 'Main Library', imageUrl: '', createdAt: '2026-10-28T11:00:00Z' },
  { id: '107', sellerId: 'u8', sellerName: 'Ava Ho', categoryId: '1', category: 'Textbooks', title: 'Calculus: Early Transcendentals', description: 'Textbook with a few pencil notes in the first two chapters. All pages intact.', price: 130, condition: 'Fair', status: 'available', location: 'Main Building', imageUrl: '', createdAt: '2026-10-27T14:00:00Z' },
  { id: '108', sellerId: 'u9', sellerName: 'Oliver Wong', categoryId: '4', category: 'Dorm supplies', title: 'Compact ceramic mug set', description: 'Two handmade stoneware mugs in a soft cream glaze. Great for morning coffee.', price: 80, condition: 'Good', status: 'available', location: 'Jockey Club Student Village', imageUrl: '', createdAt: '2026-10-26T16:00:00Z' },
]

function read<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback }
  catch { return fallback }
}
function write<T>(key: string, value: T) { localStorage.setItem(key, JSON.stringify(value)) }
function ensureSeed() { if (!localStorage.getItem(DEMO_ITEMS)) write(DEMO_ITEMS, seedItems) }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> | undefined) }
  if (!demoOnly() && ['POST', 'PATCH', 'DELETE'].includes(method) && !['/api/auth/login', '/api/auth/register', '/api/auth/logout'].includes(path)) {
    csrfToken ??= (await request<{ csrf_token: string }>('/api/csrf')).csrf_token
    headers['X-CSRF-Token'] = csrfToken
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...init, credentials: 'same-origin', headers,
  })
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) csrfToken = null
    throw new Error(body?.message ?? body?.error ?? `Request failed (${response.status})`)
  }
  return body as T
}

function demoOnly(): boolean { return import.meta.env.VITE_DEMO_MODE !== 'false' }

function userFromApi(raw: any): User {
  return { id: String(raw.id), fullName: raw.fullName ?? raw.full_name ?? '', email: raw.email, contactPhone: raw.contactPhone ?? raw.contact_phone }
}

async function getCategories(): Promise<Array<{ id: string; name: string }>> {
  if (!categoryCache) {
    const result = await request<any>('/api/categories')
    categoryCache = (Array.isArray(result) ? result : result.categories ?? []).map((row: any) => ({ id: String(row.id), name: row.name }))
  }
  return categoryCache ?? []
}

async function mapItems(rows: any[]): Promise<Item[]> {
  const categories = await getCategories()
  const names = new Map(categories.map((category) => [category.id, category.name]))
  return rows.map((row) => itemFromApi({ ...row, category: row.category ?? names.get(String(row.category_id)) ?? 'Other' }))
}

async function itemsFrom(path: string): Promise<Item[]> {
  const result = await request<any>(path)
  return mapItems(Array.isArray(result) ? result : result.items ?? [])
}

export const api = {
  get demoMode() { return demoOnly() },
  async login(email: string, password: string): Promise<User> {
    if (!demoOnly()) {
      const body = await request<any>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      return userFromApi(body.user ?? body)
    }
    if (!email.trim() || !password) throw new Error('Enter your email and password to continue.')
    const name = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    return { id: `demo-${email.toLowerCase()}`, fullName: name || 'Campus student', email }
  },
  async register(fullName: string, email: string, password: string): Promise<User> {
    if (!demoOnly()) {
      const body = await request<any>('/api/auth/register', { method: 'POST', body: JSON.stringify({ fullName, email, password }) })
      return userFromApi(body.user ?? body)
    }
    const passwordBytes = new TextEncoder().encode(password).length
    if (!fullName.trim() || !email.trim() || passwordBytes < 8 || passwordBytes > 72) throw new Error('Add your name, HKU email and a password between 8 and 72 bytes.')
    return { id: `demo-${email.toLowerCase()}`, fullName: fullName.trim(), email: email.trim() }
  },
  async currentUser(): Promise<User | null> {
    if (demoOnly()) return null
    try {
      const body = await request<any>('/api/auth/me')
      return userFromApi(body.user ?? body)
    } catch { return null }
  },
  async logout() { if (!demoOnly()) { csrfToken = null; await request('/api/auth/logout', { method: 'POST' }) } },
  async getItems(params: { search?: string; category?: string; condition?: string } = {}): Promise<Item[]> {
    if (!demoOnly()) {
      const query = new URLSearchParams()
      if (params.search) query.set('q', params.search)
      if (params.category && params.category !== 'All items') {
        const category = (await getCategories()).find((row) => row.name === params.category)
        if (category) query.set('category_id', category.id)
      }
      if (params.condition && params.condition !== 'Any condition') query.set('condition', conditionToApi(params.condition as Item['condition']))
      return itemsFrom(`/api/items${query.size ? `?${query}` : ''}`)
    }
    ensureSeed()
    let items = read<Item[]>(DEMO_ITEMS, seedItems).filter((item) => item.status === 'available')
    if (params.search) { const q = params.search.toLowerCase(); items = items.filter((item) => `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(q)) }
    if (params.category && params.category !== 'All items') items = items.filter((item) => item.category === params.category)
    if (params.condition && params.condition !== 'Any condition') items = items.filter((item) => item.condition === params.condition)
    return items
  },
  async getItem(id: string): Promise<Item | undefined> {
    if (!demoOnly()) { const body = await request<any>(`/api/items/${id}`); return (await mapItems([body.item ?? body]))[0] }
    ensureSeed(); return read<Item[]>(DEMO_ITEMS, seedItems).find((item) => item.id === id)
  },
  async getMyItems(user: User): Promise<Item[]> {
    if (!demoOnly()) {
      const statuses = ['available', 'reserved', 'sold', 'removed']
      const groups = await Promise.all(statuses.map((status) => itemsFrom(`/api/items?seller_id=${encodeURIComponent(user.id)}&status=${status}`)))
      return groups.flat()
    }
    ensureSeed(); return read<Item[]>(DEMO_ITEMS, seedItems).filter((item) => item.sellerId === user.id)
  },
  async saveItem(draft: ItemDraft, user: User, id?: string): Promise<Item> {
    if (!demoOnly()) {
      const category = (await getCategories()).find((row) => row.name === draft.category)
      if (!category) throw new Error('This listing category is not available on the server.')
      const body = { title: draft.title, description: draft.description, price: String(draft.price), item_condition: conditionToApi(draft.condition), category_id: category.id, location: draft.location, image_url: draft.imageUrl || null }
      const saved = await request<any>(id ? `/api/items/${id}` : '/api/items', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) })
      return (await mapItems([saved.item ?? saved]))[0]
    }
    ensureSeed(); const items = read<Item[]>(DEMO_ITEMS, seedItems)
    const existing = id ? items.find((item) => item.id === id) : undefined
    const item: Item = { ...existing, ...draft, id: id ?? String(Date.now()), sellerId: existing?.sellerId ?? user.id, sellerName: existing?.sellerName ?? user.fullName, categoryId: existing?.categoryId ?? String(categories.indexOf(draft.category)), status: existing?.status ?? 'available', price: Number(draft.price), createdAt: existing?.createdAt ?? new Date().toISOString() }
    write(DEMO_ITEMS, existing ? items.map((old) => old.id === id ? item : old) : [item, ...items])
    return item
  },
  async deleteItem(id: string) {
    if (!demoOnly()) return request(`/api/items/${id}`, { method: 'DELETE' })
    ensureSeed(); write(DEMO_ITEMS, read<Item[]>(DEMO_ITEMS, seedItems).filter((item) => item.id !== id))
    write(DEMO_FAVORITES, read<string[]>(DEMO_FAVORITES, []).filter((favorite) => favorite !== id))
  },
  async getFavorites(): Promise<string[]> {
    // The C branch does not mount favorites routes; E's API contract is still pending.
    if (!demoOnly()) return []
    return read<string[]>(DEMO_FAVORITES, [])
  },
  async toggleFavorite(id: string, active: boolean) {
    if (!demoOnly()) throw new Error('Favorites are not connected to the server yet.')
    const current = read<string[]>(DEMO_FAVORITES, [])
    write(DEMO_FAVORITES, active ? current.filter((favorite) => favorite !== id) : [...current, id])
  },
  async getOrders(): Promise<Order[]> {
    if (!demoOnly()) { const body = await request<any>('/api/orders'); return (Array.isArray(body) ? body : body.orders ?? []).map(orderFromApi) }
    return read<Order[]>(DEMO_ORDERS, [])
  },
  async placeOrder(item: Item, user: User, pickupLocation: string): Promise<Order> {
    if (!demoOnly()) return orderFromApi(await request<any>('/api/orders', { method: 'POST', body: JSON.stringify({ item_id: item.id, pickup_location: pickupLocation }) }))
    const orders = read<Order[]>(DEMO_ORDERS, [])
    if (orders.some((order) => order.itemId === item.id && ['pending', 'confirmed'].includes(order.status))) throw new Error('This item already has an active order.')
    const order: Order = { id: String(Date.now()), buyerId: user.id, buyerName: user.fullName, sellerId: item.sellerId, sellerName: item.sellerName, itemId: item.id, itemTitle: item.title, itemImage: item.imageUrl, agreedAmount: item.price, pickupLocation, status: 'pending', createdAt: new Date().toISOString() }
    write(DEMO_ORDERS, [order, ...orders])
    const items = read<Item[]>(DEMO_ITEMS, seedItems); write(DEMO_ITEMS, items.map((entry) => entry.id === item.id ? { ...entry, status: 'reserved' } : entry))
    return order
  },
  async updateOrder(order: Order, status: Order['status']) {
    if (!demoOnly()) return request(`/api/orders/${order.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
    write(DEMO_ORDERS, read<Order[]>(DEMO_ORDERS, []).map((entry) => entry.id === order.id ? { ...entry, status } : entry))
    if (status === 'cancelled') {
      const items = read<Item[]>(DEMO_ITEMS, seedItems); write(DEMO_ITEMS, items.map((entry) => entry.id === order.itemId ? { ...entry, status: 'available' } : entry))
    } else if (status === 'completed') {
      const items = read<Item[]>(DEMO_ITEMS, seedItems); write(DEMO_ITEMS, items.map((entry) => entry.id === order.itemId ? { ...entry, status: 'sold' } : entry))
    }
  },
}
