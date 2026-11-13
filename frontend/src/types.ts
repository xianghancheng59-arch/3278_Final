export type ItemStatus = 'available' | 'reserved' | 'sold' | 'removed'
export type Condition = 'New' | 'Like new' | 'Good' | 'Fair'
export type OrderStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled'

export interface User {
  id: string
  fullName: string
  email: string
  contactPhone?: string
}

export interface Item {
  id: string
  sellerId: string
  sellerName: string
  categoryId: string
  category: string
  title: string
  description: string
  price: number
  condition: Condition
  status: ItemStatus
  location: string
  imageUrl?: string
  createdAt: string
}

export interface Order {
  id: string
  buyerId: string
  buyerName: string
  sellerId: string
  sellerName: string
  itemId: string
  itemTitle: string
  itemImage?: string
  agreedAmount: number
  pickupLocation: string
  status: OrderStatus
  createdAt: string
}

export type ItemDraft = Pick<Item, 'title' | 'description' | 'price' | 'condition' | 'category' | 'location' | 'imageUrl'>

export const categories = ['All items', 'Textbooks', 'Electronics', 'Stationery', 'Dorm supplies', 'Sports']

export function conditionFromApi(value: unknown): Condition {
  const normalized = String(value ?? '').toLowerCase().replace(/\s+/g, '_')
  if (normalized === 'new') return 'New'
  if (normalized === 'like_new') return 'Like new'
  if (normalized === 'fair') return 'Fair'
  return 'Good'
}

export function conditionToApi(value: Condition): string {
  return value.toLowerCase().replace(/\s+/g, '_')
}

export function itemFromApi(value: any): Item {
  return {
    id: String(value.id), sellerId: String(value.sellerId ?? value.seller_id ?? ''),
    sellerName: value.sellerName ?? value.seller_name ?? value.seller?.full_name ?? 'Campus seller',
    categoryId: String(value.categoryId ?? value.category_id ?? ''),
    category: value.category ?? value.category_name ?? value.categoryName ?? 'Other',
    title: value.title ?? '', description: value.description ?? '', price: Number(value.price ?? 0),
    condition: conditionFromApi(value.condition ?? value.item_condition), status: value.status ?? 'available',
    location: value.location ?? '', imageUrl: value.imageUrl ?? value.image_url ?? '',
    createdAt: value.createdAt ?? value.created_at ?? new Date().toISOString(),
  }
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

export function orderFromApi(value: any): Order {
  const item = value.item ?? {}
  const listing = value.listing ?? value.product ?? {}
  const buyer = value.buyer ?? {}
  const seller = value.seller ?? {}
  const itemId = String(value.itemId ?? value.item_id ?? item.id ?? '')
  const itemTitle = firstText(value.itemTitle, value.item_title, value.itemName, value.item_name, value.listingTitle, value.listing_title, value.title, item.title, item.name, listing.title, listing.name)
    ?? (itemId ? `Item ${itemId}` : 'Untitled item')
  return {
    id: String(value.id), buyerId: String(value.buyerId ?? value.buyer_id ?? buyer.id ?? ''),
    buyerName: value.buyerName ?? value.buyer_name ?? buyer.full_name ?? 'Buyer',
    sellerId: String(value.sellerId ?? value.seller_id ?? seller.id ?? ''),
    sellerName: value.sellerName ?? value.seller_name ?? seller.full_name ?? 'Seller',
    itemId,
    itemTitle,
    itemImage: value.itemImage ?? value.item_image ?? item.image_url ?? listing.image_url ?? '',
    agreedAmount: Number(value.agreedAmount ?? value.agreed_amount ?? 0),
    pickupLocation: value.pickupLocation ?? value.pickup_location ?? '',
    status: value.status ?? 'pending', createdAt: value.createdAt ?? value.created_at ?? new Date().toISOString(),
  }
}
