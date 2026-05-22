import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import imageCompression from 'browser-image-compression'
import './App.css'

function App() {
  const [session, setSession] = useState(null)
  const [mangaList, setMangaList] = useState([])
  const [loading, setLoading] = useState(true)

  // Auth States
  const [isSignUp, setIsSignUp] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // Global Creation States
  const [title, setTitle] = useState('')
  const [type, setType] = useState('Manhwa')
  const [chapter, setChapter] = useState('1')
  const [status, setStatus] = useState('Reading')
  const [coverUrl, setCoverUrl] = useState('')
  const [uploading, setUploading] = useState(false)

  // Inline Edit Mode Trackers
  const [editingTitle, setEditingTitle] = useState(null)
  const [editFields, setEditFields] = useState({ title: '', type: '', current_chapter: 0, status: '', cover_url: '' })

  useEffect(() => {
    // Check initial auth session status
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // Listen for authentication changes (login, logout, signup)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) {
      fetchManga()
    }
  }, [session])

  async function handleAuth(e) {
    e.preventDefault()
    if (!authEmail || !authPassword) return
    try {
      setAuthLoading(true)
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword })
        if (error) throw error
        alert('Check your email for the confirmation link!')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
        if (error) throw error
      }
    } catch (error) {
      alert(error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setMangaList([])
  }

  async function fetchManga() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('reading_list')
        .select('*')
      if (error) throw error
      setMangaList(data || [])
    } catch (error) {
      console.error('Error fetching data:', error.message)
    } finally {
      setLoading(false)
    }
  }

  // Helper: Extract unique storage filename from a public asset URL
  function getFilenameFromUrl(url) {
    if (!url || !url.includes('/storage/v1/object/public/covers/')) return null
    return url.split('/storage/v1/object/public/covers/').pop()
  }

  // Helper: Hard-purge an asset from the storage bucket
  async function deleteStorageFile(filename) {
    if (!filename) return
    try {
      const { error } = await supabase.storage.from('covers').remove([filename])
      if (error) throw error
      console.log(`Purged orphaned asset: ${filename}`)
    } catch (error) {
      console.error('Storage cleanup failed:', error.message)
    }
  }

  // Compress photo and stream it into user-scoped bucket folders
  async function uploadCoverImage(file) {
    try {
      setUploading(true)
      const options = { maxSizeMB: 0.05, maxWidthOrHeight: 500, useWebWorker: true, fileType: 'image/webp' }
      const compressedFile = await imageCompression(file, options)
      
      // Organize storage folders by using the user's ID
      const fileName = `${session.user.id}/${Date.now()}.webp`

      const { error: uploadError } = await supabase.storage
        .from('covers')
        .upload(fileName, compressedFile)

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('covers').getPublicUrl(fileName)
      return data.publicUrl
    } catch (error) {
      alert('Upload error: ' + error.message)
      return null
    } finally {
      setUploading(false)
    }
  }

  async function handleMainFileChange(e) {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    if (coverUrl) {
      const oldFilename = getFilenameFromUrl(coverUrl)
      if (oldFilename) await deleteStorageFile(oldFilename)
    }
    const publicUrl = await uploadCoverImage(file)
    if (publicUrl) setCoverUrl(publicUrl)
  }

  async function handleEditFileChange(e) {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    if (editFields.cover_url && editFields.cover_url !== mangaList.find(i => i.title === editingTitle)?.cover_url) {
      const oldFilename = getFilenameFromUrl(editFields.cover_url)
      if (oldFilename) await deleteStorageFile(oldFilename)
    }
    const publicUrl = await uploadCoverImage(file)
    if (publicUrl) setEditFields({ ...editFields, cover_url: publicUrl })
  }

  async function handleAddSeries(e) {
    e.preventDefault()
    if (!title.trim()) return
    try {
      const { error } = await supabase.from('reading_list').insert([
        {
          title: title.trim(),
          type,
          current_chapter: parseFloat(chapter) || 0,
          status,
          cover_url: coverUrl || null,
          user_id: session.user.id // Assigns row ownership to current user profile ID
        }
      ])
      if (error) throw error
      setTitle('')
      setCoverUrl('')
      setChapter('1')
      fetchManga()
    } catch (error) {
      console.error('Error adding series:', error.message)
    }
  }

  async function stepChapter(seriesTitle, currentCh, amount) {
    const targetCh = Math.max(0, currentCh + amount)
    setMangaList(prev => prev.map(item => item.title === seriesTitle ? { ...item, current_chapter: targetCh } : item))
    try {
      const { error } = await supabase.from('reading_list').update({ current_chapter: targetCh }).eq('title', seriesTitle)
      if (error) throw error
    } catch (error) {
      console.error('Chapter update failed:', error.message)
    }
  }

  function startEditing(item) {
    setEditingTitle(item.title)
    setEditFields({
      title: item.title,
      type: item.type || 'Manga',
      current_chapter: item.current_chapter ?? 0,
      status: item.status || 'Reading',
      cover_url: item.cover_url || ''
    })
  }

  async function handleSaveEdits(originalTitle) {
    if (!editFields.title.trim()) return
    try {
      const originalItem = mangaList.find(item => item.title === originalTitle)
      if (originalItem && originalItem.cover_url && originalItem.cover_url !== editFields.cover_url) {
        const fileToPurge = getFilenameFromUrl(originalItem.cover_url)
        if (fileToPurge) await deleteStorageFile(fileToPurge)
      }

      const { error } = await supabase
        .from('reading_list')
        .update({
          title: editFields.title.trim(),
          type: editFields.type,
          current_chapter: parseFloat(editFields.current_chapter) || 0,
          status: editFields.status,
          cover_url: editFields.cover_url || null
        })
        .eq('title', originalTitle)

      if (error) throw error
      setEditingTitle(null)
      fetchManga()
    } catch (error) {
      console.error('Edit transaction failure:', error.message)
    }
  }

  async function deleteSeries(seriesTitle) {
    if (!window.confirm(`Remove "${seriesTitle}" from your list?`)) return
    try {
      const targetItem = mangaList.find(item => item.title === seriesTitle)
      if (targetItem && targetItem.cover_url) {
        const fileToPurge = getFilenameFromUrl(targetItem.cover_url)
        if (fileToPurge) await deleteStorageFile(fileToPurge)
      }
      const { error } = await supabase.from('reading_list').delete().eq('title', seriesTitle)
      if (error) throw error
      setMangaList(prev => prev.filter(item => item.title !== seriesTitle))
    } catch (error) {
      console.error('Deletion failure:', error.message)
    }
  }

  // Auth Gateway View
  if (!session) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <h2>NEXUS<span>LIST</span></h2>
          <p>{isSignUp ? 'Create your tracker account' : 'Sign in to access your shelf'}</p>
          <form onSubmit={handleAuth} className="auth-form-body">
            <input 
              type="email" 
              placeholder="Email Address" 
              value={authEmail} 
              onChange={(e) => setAuthEmail(e.target.value)} 
              required 
            />
            <input 
              type="password" 
              placeholder="Password" 
              value={authPassword} 
              onChange={(e) => setAuthPassword(e.target.value)} 
              required 
            />
            <button type="submit" disabled={authLoading}>
              {authLoading ? 'Verifying...' : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>
          <p className="auth-toggle-text">
            {isSignUp ? 'Already tracking? ' : "Don't have an account? "}
            <span onClick={() => setIsSignUp(!isSignUp)}>
              {isSignUp ? 'Sign In instead' : 'Create an Account'}
            </span>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <header className="main-header user-header-layout">
        <div className="logo-section">
          <h1>NEXUS<span>LIST</span></h1>
          <p>Manga • Manhua • Manhwa Dashboard</p>
        </div>
        <div className="user-badge-profile">
          <span className="user-email">{session.user.email}</span>
          <button onClick={handleLogout} className="logout-action-btn">Log Out</button>
        </div>
      </header>

      {/* Input Shelf */}
      <form onSubmit={handleAddSeries} className="premium-form">
        <div className="shelf-row main-fields">
          <input 
            type="text" 
            placeholder="Series Title" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)} 
            required 
            className="neon-input"
          />
          <div className="file-upload-wrapper neon-input">
            <label htmlFor="main-file-input" className="file-label">
              {uploading ? 'Optimizing...' : coverUrl ? '✓ Ready to Track' : '📁 Upload Cover Photo'}
            </label>
            <input 
              id="main-file-input"
              type="file" 
              accept="image/*"
              onChange={handleMainFileChange}
              disabled={uploading}
            />
          </div>
        </div>
        <div className="shelf-row control-fields">
          <select value={type} onChange={(e) => setType(e.target.value)} className="neon-select">
            <option value="Manga">Manga</option>
            <option value="Manhua">Manhua</option>
            <option value="Manhwa">Manhwa</option>
          </select>
          <div className="inline-ch-input">
            <label>Ch:</label>
            <input 
              type="number" 
              step="0.1"
              value={chapter} 
              onChange={(e) => setChapter(e.target.value)} 
              required 
            />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="neon-select">
            <option value="Reading">Reading</option>
            <option value="Plan to Read">Plan to Read</option>
            <option value="On Hold">On Hold</option>
            <option value="Completed">Completed</option>
          </select>
          <button type="submit" className="neon-btn" disabled={uploading}>
            {uploading ? 'Processing...' : 'Track Series'}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="spinner-container"><div className="spinner"></div></div>
      ) : (
        <div className="premium-grid">
          {mangaList.length === 0 ? (
            <p className="empty-message">Your database shelf is completely clear.</p>
          ) : (
            mangaList.map((item) => {
              const isEditing = editingTitle === item.title

              return (
                <div key={item.title || Math.random().toString()} className={`premium-card ${isEditing ? 'editing-active' : ''}`}>
                  <button className="glass-delete" onClick={() => deleteSeries(item.title)}>×</button>
                  
                  <div className="image-wrapper">
                    {item.cover_url ? (
                      <img src={item.cover_url} alt={item.title} className="card-cover" />
                    ) : (
                      <div className="card-placeholder-cover">📖</div>
                    )}
                    {!isEditing && (
                      <span className={`pill-badge ${(item.type || 'Manga').toLowerCase()}`}>
                        {item.type || 'Manga'}
                      </span>
                    )}
                  </div>

                  <div className="card-body">
                    {isEditing ? (
                      <div className="edit-panel-inputs">
                        <label>Title</label>
                        <input 
                          type="text" 
                          value={editFields.title}
                          onChange={(e) => setEditFields({ ...editFields, title: e.target.value })}
                          className="edit-text-field"
                        />
                        
                        <label>Change Cover</label>
                        <div className="edit-file-wrapper">
                          <label htmlFor={`edit-file-${item.title}`} className="edit-file-label">
                            {uploading ? 'Optimizing...' : '📁 Auto-Compress & Replace'}
                          </label>
                          <input 
                            id={`edit-file-${item.title}`}
                            type="file" 
                            accept="image/*"
                            onChange={handleEditFileChange}
                            disabled={uploading}
                          />
                        </div>

                        <div className="edit-split-row">
                          <div>
                            <label>Type</label>
                            <select 
                              value={editFields.type} 
                              onChange={(e) => setEditFields({ ...editFields, type: e.target.value })}
                            >
                              <option value="Manga">Manga</option>
                              <option value="Manhua">Manhua</option>
                              <option value="Manhwa">Manhwa</option>
                            </select>
                          </div>
                          <div>
                            <label>Chapter</label>
                            <input 
                              type="number" 
                              step="0.1"
                              value={editFields.current_chapter}
                              onChange={(e) => setEditFields({ ...editFields, current_chapter: e.target.value })}
                            />
                          </div>
                        </div>

                        <label>Status</label>
                        <select 
                          value={editFields.status} 
                          onChange={(e) => setEditFields({ ...editFields, status: e.target.value })}
                          className="edit-select-field"
                        >
                          <option value="Reading">Reading</option>
                          <option value="Plan to Read">Plan to Read</option>
                          <option value="On Hold">On Hold</option>
                          <option value="Completed">Completed</option>
                        </select>

                        <div className="edit-action-buttons">
                          <button type="button" className="save-edit-btn" onClick={() => handleSaveEdits(item.title)} disabled={uploading}>Save</button>
                          <button type="button" className="cancel-edit-btn" onClick={() => setEditingTitle(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 title={item.title}>{item.title || 'Untitled Series'}</h3>
                        
                        <div className="interactive-counter-box">
                          <button type="button" onClick={() => stepChapter(item.title, item.current_chapter ?? 0, -1)}>-</button>
                          <div className="input-numeric-wrapper display-mode">
                            <span>Ch</span>
                            <span className="ch-number-text">{item.current_chapter ?? 0}</span>
                          </div>
                          <button type="button" onClick={() => stepChapter(item.title, item.current_chapter ?? 0, 1)}>+</button>
                        </div>

                        <div className="footer-status-row">
                          <span className={`dot-indicator ${(item.status || 'Reading').toLowerCase().replace(/\s+/g, '-')}`}></span>
                          <span className="status-label">{item.status || 'Reading'}</span>
                          <button type="button" className="trigger-edit-mode-btn" onClick={() => startEditing(item)}>Edit Details</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default App