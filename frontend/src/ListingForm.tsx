import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import { categories, Condition, Item, ItemDraft } from './types'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function ListingForm({ item, busy, error, onSave, onCancel }: {
  item: Item | null
  busy: boolean
  error: string
  onSave: (draft: ItemDraft) => Promise<void>
  onCancel: () => void
}) {
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '')
  const [photo, setPhoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [failedPreview, setFailedPreview] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [checkingPhoto, setCheckingPhoto] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const selection = useRef(0)
  const preview = photo ? previewUrl : imageUrl.trim()

  useEffect(() => {
    if (!photo) { setPreviewUrl(''); return }
    const url = URL.createObjectURL(photo)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])
  useEffect(() => () => { selection.current += 1 }, [])

  function clearSelection() {
    selection.current += 1
    setPhoto(null)
    setPhotoError('')
    setCheckingPhoto(false)
    setFailedPreview('')
    if (fileInput.current) fileInput.current.value = ''
  }

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    const currentSelection = ++selection.current
    setPhotoError('')
    setCheckingPhoto(false)
    if (!PHOTO_TYPES.includes(file.type)) {
      setPhotoError('Choose a JPEG, PNG or WebP photo.')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('This photo is too large. Choose a file no larger than 5 MB.')
      return
    }
    setCheckingPhoto(true)
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('Empty image')
      if (selection.current !== currentSelection) return
      setPhoto(file)
      setFailedPreview('')
    } catch {
      if (selection.current === currentSelection) setPhotoError('This file could not be read as a photo. Please choose another JPEG, PNG or WebP image.')
    } finally {
      URL.revokeObjectURL(url)
      if (selection.current === currentSelection) setCheckingPhoto(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || checkingPhoto || photoError) return
    const form = new FormData(event.currentTarget)
    void onSave({
      title: String(form.get('title')).trim(),
      description: String(form.get('description')).trim(),
      price: Number(form.get('price')),
      condition: String(form.get('condition')) as Condition,
      category: String(form.get('category')),
      location: String(form.get('location')).trim(),
      imageUrl: imageUrl.trim(),
      ...(photo ? { photo } : {}),
    })
  }

  return <form onSubmit={submit} className="listing-form" aria-busy={busy}>
    <fieldset className="listing-fields" disabled={busy}>
      <div className="form-main">
        <label>What are you selling?<input name="title" defaultValue={item?.title} placeholder="e.g. Sony headphones in great condition" maxLength={120} required/></label>
        <label>Tell us a little about it<textarea name="description" defaultValue={item?.description} placeholder="Condition, what’s included, why you loved it…" rows={5} maxLength={1200} required/></label>
        <div className="form-two-columns">
          <label>Price <span className="input-prefix"><b>HK$</b><input name="price" type="number" min="0" step="0.01" defaultValue={item?.price} placeholder="0.00" required/></span></label>
          <label>Condition<select name="condition" defaultValue={item?.condition ?? 'Good'}><option>New</option><option>Like new</option><option>Good</option><option>Fair</option></select></label>
        </div>
        <div className="form-two-columns">
          <label>Category<select name="category" defaultValue={item?.category ?? 'Electronics'}>{categories.slice(1).map((entry) => <option key={entry}>{entry}</option>)}</select></label>
          <label>Meetup location<input name="location" defaultValue={item?.location} placeholder="e.g. Main Library" required/></label>
        </div>
        <div className="listing-photo-panel">
          <div className="listing-photo-controls">
            <label htmlFor="listing-photo">{item ? 'Replace photo' : 'Upload photo'} <span className="optional-label">OPTIONAL</span></label>
            <input ref={fileInput} id="listing-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="photo-help" onChange={(event) => void selectPhoto(event)}/>
            <p id="photo-help" className="photo-help">JPEG, PNG or WebP · up to 5 MB. Choose a clear photo of the item you are selling.</p>
            <label>Or use a photo URL<input name="imageUrl" inputMode="url" value={imageUrl} placeholder="https://…" onChange={(event) => { clearSelection(); setImageUrl(event.target.value) }}/></label>
            {(imageUrl || photo || photoError) && <button type="button" className="photo-remove" onClick={() => { clearSelection(); setImageUrl('') }}>Remove photo</button>}
            <p className="photo-help">{photo ? `Selected: ${photo.name}. The new photo will replace the current one when you save.` : item?.imageUrl && imageUrl ? 'Your current photo is kept unless you replace or remove it.' : 'You can add or replace a photo later.'}</p>
            {checkingPhoto && <p className="photo-help" role="status">Checking photo…</p>}
            {photoError && <p className="form-error" role="alert">{photoError}</p>}
          </div>
          <div className="listing-photo-preview" aria-label="Listing photo preview">
            {preview && failedPreview !== preview
              ? <img src={preview} alt="Listing photo preview" onError={() => { setFailedPreview(preview); if (photo) setPhotoError('This photo could not be displayed. Please choose another image.') }}/>
              : <div className="photo-placeholder"><span aria-hidden="true">▧</span><strong>{preview ? 'Photo unavailable' : 'No photo selected'}</strong><small>{preview ? 'Check the URL or choose a photo from your device.' : 'Your photo preview will appear here.'}</small></div>}
          </div>
        </div>
        <div className="privacy-hint">Keep it public and simple: use a campus landmark, not your room number.</div>
      </div>
    </fieldset>
    <div className="form-footer">
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      <button className="primary-button" type="submit" disabled={busy || checkingPhoto || Boolean(photoError)}>{busy ? 'Saving…' : item ? 'Save changes' : 'Publish listing'}</button>
    </div>
  </form>
}
