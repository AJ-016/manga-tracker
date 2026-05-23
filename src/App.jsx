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

  // Global Creation Form States
  const [title, setTitle] = useState('')
  const [type, setType] = useState('Manhwa')
  const [chapter, setChapter] = useState('1')
  const [status, setStatus] = useState('Reading')
  const [coverUrl, setCoverUrl] = useState('')
  const [uploading, setUploading] = useState(false)

  // Dynamic Multi-Site Entry Array States
  const [creationLinks, setCreationLinks] = useState(['']) 

  // Layout Display Toggles & Search
  const [viewMode, setViewMode] = useState('grid') 
  const [sortBy, setSortBy] = useState('title') 
  const [searchQuery, setSearchQuery] = useState('') 

  // Drag and Drop Visual Flags
  const [isDraggingMain, setIsDraggingMain] = useState(false)
  const [draggingCardTitle, setDraggingCardTitle] = useState(null)
  const [isDraggingOverlay, setIsDraggingOverlay] = useState(false)

  // Main Dashboard Card Inline Editing State
  const [editingTitle, setEditingTitle] = useState(null)

  // Immersive Separate Full Details Overlay Page State Engine
  const [selectedSeriesPage, setSelectedSeriesPage] = useState(null)
  const [editFields, setEditFields] = useState({ title: '', type: '', current_chapter: 0, status: '', cover_url: '', reading_url: '' })
  const [pageEditLinks, setPageEditLinks] = useState([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

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
      
      if (selectedSeriesPage) {
        const liveMatch = data.find(i => i.title === selectedSeriesPage.title)
        if (liveMatch) {
          setSelectedSeriesPage(liveMatch)
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error.message)
    } finally {
      setLoading(false)
    }
  }

  function getFilenameFromUrl(url) {
    if (!url || !url.includes('/storage/v1/object/public/covers/')) return null
    return url.split('/storage/v1/object/public/covers/').pop()
  }

  async function deleteStorageFile(filename) {
    if (!filename) return
    try {
      const { error } = await supabase.storage.from('covers').remove([filename])
      if (error) throw error
    } catch (error) {
      console.error('Storage cleanup failed:', error.message)
    }
  }

  async function uploadCoverImage(file, mode = 'main') {
    try {
      setUploading(true)
      const options = { maxSizeMB: 0.05, maxWidthOrHeight: 500, useWebWorker: true, fileType: 'image/webp' }
      const compressedFile = await imageCompression(file, options)
      const fileName = `${session.user.id}/${Date.now()}.webp`

      const { error: uploadError } = await supabase.storage
        .from('covers')
        .upload(fileName, compressedFile)

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('covers').getPublicUrl(fileName)
      
      if (mode === 'main') {
        setCoverUrl(data.publicUrl)
      } else if (mode === 'edit' || mode === 'overlay') {
        setEditFields(prev => ({ ...prev, cover_url: data.publicUrl }))
      }
      return data.publicUrl
    } catch (error) {
      alert('Upload error: ' + error.message)
      return null
    } finally {
      setUploading(false)
    }
  }

  function handleDragOver(e, type, targetTitle = null) {
    e.preventDefault()
    if (type === 'main') setIsDraggingMain(true)
    if (type === 'card') setDraggingCardTitle(targetTitle)
    if (type === 'overlay') setIsDraggingOverlay(true)
  }

  function handleDragLeave(e, type) {
    e.preventDefault()
    if (type === 'main') setIsDraggingMain(false)
    if (type === 'card') setDraggingCardTitle(null)
    if (type === 'overlay') setIsDraggingOverlay(false)
  }

  async function handleDropMain(e) {
    e.preventDefault()
    setIsDraggingMain(false)
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return
    const file = e.dataTransfer.files[0]
    if (!file.type.startsWith('image/')) return alert('Please drop image files only!')
    
    if (coverUrl) {
      const oldFilename = getFilenameFromUrl(coverUrl)
      if (oldFilename) await deleteStorageFile(oldFilename)
    }
    const publicUrl = await uploadCoverImage(file, 'main')
    if (publicUrl) setCoverUrl(publicUrl)
  }

  async function handleDropEdit(e) {
    e.preventDefault()
    setDraggingCardTitle(null)
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return
    const file = e.dataTransfer.files[0]
    if (!file.type.startsWith('image/')) return alert('Please drop image files only!')
    
    if (editFields.cover_url && editFields.cover_url !== mangaList.find(i => i.title === editingTitle)?.cover_url) {
      const oldFilename = getFilenameFromUrl(editFields.cover_url)
      if (oldFilename) await deleteStorageFile(oldFilename)
    }
    const publicUrl = await uploadCoverImage(file, 'edit')
    if (publicUrl) setEditFields(prev => ({ ...prev, cover_url: publicUrl }))
  }

  async function handleDropOverlay(e) {
    e.preventDefault()
    setIsDraggingOverlay(false)
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return
    const file = e.dataTransfer.files[0]
    if (!file.type.startsWith('image/')) return alert('Please drop image files only!')

    if (editFields.cover_url && editFields.cover_url !== selectedSeriesPage.cover_url) {
      const oldFilename = getFilenameFromUrl(editFields.cover_url)
      if (oldFilename) await deleteStorageFile(oldFilename)
    }
    const publicUrl = await uploadCoverImage(file, 'overlay')
    if (publicUrl) setEditFields(prev => ({ ...prev, cover_url: publicUrl }))
  }

  async function handleMainFileChange(e) {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    if (coverUrl) {
      const oldFilename = getFilenameFromUrl(coverUrl)
      if (oldFilename) await deleteStorageFile(oldFilename)
    }
    const publicUrl = await uploadCoverImage(file, 'main')
    if (publicUrl) setCoverUrl(publicUrl)
  }

  async function handleEditFileChange(e) {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    if (editFields.cover_url && editFields.cover_url !== mangaList.find(i => i.title === editingTitle)?.cover_url) {
      const oldFilename = getFilenameFromUrl(editFields.cover_url)
      if (oldFilename) await deleteStorageFile(oldFilename)
    }
    const publicUrl = await uploadCoverImage(file, 'edit')
    if (publicUrl) setEditFields(prev => ({ ...prev, cover_url: publicUrl }))
  }

  function updateCreationLinkValue(index, value) {
    const updated = [...creationLinks]
    updated[index] = value
    setCreationLinks(updated)
  }
  function addCreationLinkField() { setCreationLinks([...creationLinks, '']) }
  function removeCreationLinkField(index) {
    const updated = creationLinks.filter((_, idx) => idx !== index)
    setCreationLinks(updated.length === 0 ? [''] : updated)
  }

  function updatePageLinkValue(index, value) {
    const updated = [...pageEditLinks]
    updated[index] = value
    setPageEditLinks(updated)
  }
  function addPageLinkField() { setPageEditLinks([...pageEditLinks, '']) }
  function removePageLinkField(index) {
    const updated = pageEditLinks.filter((_, idx) => idx !== index)
    setPageEditLinks(updated.length === 0 ? [''] : updated)
  }

  async function handleAddSeries(e) {
    e.preventDefault()
    if (!title.trim()) return
    const serializedLinks = creationLinks.map(l => l.trim()).filter(Boolean).join(',')
    try {
      const { error } = await supabase.from('reading_list').insert([
        {
          title: title.trim(),
          type,
          current_chapter: parseFloat(chapter) || 0,
          status,
          cover_url: coverUrl || null,
          reading_url: serializedLinks || null,
          user_id: session.user.id
        }
      ])
      if (error) throw error
      setTitle('')
      setCoverUrl('')
      setChapter('1')
      setCreationLinks([''])
      fetchManga()
    } catch (error) {
      console.error('Error adding series:', error.message)
    }
  }

  async function stepChapter(seriesTitle, currentCh, amount) {
    const targetCh = Math.max(0, currentCh + amount)
    setMangaList(prev => prev.map(item => item.title === seriesTitle ? { ...item, current_chapter: targetCh } : item))
    try {
      await supabase.from('reading_list').update({ current_chapter: targetCh }).eq('title', seriesTitle)
    } catch (error) {
      console.error(error.message)
    }
  }

  function startEditing(item) {
    setEditingTitle(item.title)
    setEditFields({
      title: item.title,
      type: item.type || 'Manga',
      current_chapter: item.current_chapter ?? 0,
      status: item.status || 'Reading',
      cover_url: item.cover_url || '',
      reading_url: item.reading_url || ''
    })
  }

  async function handleSaveCardEdits(originalTitle) {
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
          cover_url: editFields.cover_url || null,
          reading_url: editFields.reading_url.trim() || null
        })
        .eq('title', originalTitle)

      if (error) throw error
      setEditingTitle(null)
      fetchManga()
    } catch (error) {
      console.error('Edit transaction failure:', error.message)
    }
  }

  async function handleSaveFullPageOverlayEdits(originalTitle) {
    if (!editFields.title.trim()) return
    const combinedSerializedString = pageEditLinks.map(l => l.trim()).filter(Boolean).join(',')
    try {
      if (selectedSeriesPage.cover_url && selectedSeriesPage.cover_url !== editFields.cover_url) {
        const fileToPurge = getFilenameFromUrl(selectedSeriesPage.cover_url)
        if (fileToPurge) await deleteStorageFile(fileToPurge)
      }

      const { error } = await supabase
        .from('reading_list')
        .update({
          title: editFields.title.trim(),
          type: editFields.type,
          current_chapter: parseFloat(editFields.current_chapter) || 0,
          status: editFields.status,
          cover_url: editFields.cover_url || null,
          reading_url: combinedSerializedString || null
        })
        .eq('title', originalTitle)

      if (error) throw error
      alert('System Configurations Sync Complete!')
      fetchManga()
    } catch (error) {
      alert(error.message)
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
      await supabase.from('reading_list').delete().eq('title', seriesTitle)
      setSelectedSeriesPage(null) 
      fetchManga()
    } catch (error) {
      console.error(error.message)
    }
  }

  function parseMultipleLinks(linksString) {
    if (!linksString) return []
    return linksString.split(',').map(url => url.trim()).filter(Boolean)
  }

  function getDomainName(urlStr) {
    try {
      return new URL(urlStr).hostname.replace('www.', '')
    } catch {
      return 'Target Bookmark'
    }
  }

  function handleOpenOverlayPage(item) {
    setSelectedSeriesPage(item)
    setEditFields({
      title: item.title,
      type: item.type || 'Manhwa',
      current_chapter: item.current_chapter ?? 0,
      status: item.status || 'Reading',
      cover_url: item.cover_url || '',
      reading_url: item.reading_url || ''
    })
    const existingArray = parseMultipleLinks(item.reading_url)
    setPageEditLinks(existingArray.length === 0 ? [''] : existingArray)
  }

  const processedFilteredData = [...mangaList]
    .filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'chapter') return (b.current_chapter || 0) - (a.current_chapter || 0)
      if (sortBy === 'type') return (a.type || '').localeCompare(b.type || '')
      return (a.title || '').localeCompare(b.title || '')
    })

  if (!session) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <h2>NEXUS<span>LIST</span></h2>
          <p>{isSignUp ? 'Create your tracker account' : 'Sign in to access your shelf'}</p>
          <form onSubmit={handleAuth} className="auth-form-body">
            <input type="email" placeholder="Email Address" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required />
            <input type="password" placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required />
            <button type="submit" disabled={authLoading}>{authLoading ? 'Verifying...' : isSignUp ? 'Create Account' : 'Sign In'}</button>
          </form>
          <p className="auth-toggle-text">
            {isSignUp ? 'Already tracking? ' : "Don't have an account? "}
            <span onClick={() => setIsSignUp(!isSignUp)}>{isSignUp ? 'Sign In instead' : 'Create an Account'}</span>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      
      {selectedSeriesPage && (
        <div className="immersive-page-overlay modal-open-fade">
          <div className="immersive-page-card">
            <header className="page-header-row">
              <button type="button" className="back-panel-btn" onClick={() => setSelectedSeriesPage(null)}>← Back to Shelf</button>
              <span className={`pill-badge static-display ${(editFields.type || 'Manhwa').toLowerCase()}`}>{editFields.type || 'Manhwa'}</span>
            </header>
            
            <div className="page-body-grid">
              
              <div className="page-visual-column">
                <div 
                  className={`page-media-container-box ${isDraggingOverlay ? 'drag-active' : ''}`}
                  onDragOver={(e) => handleDragOver(e, 'overlay')}
                  onDragLeave={(e) => handleDragLeave(e, 'overlay')}
                  onDrop={handleDropOverlay}
                >
                  {editFields.cover_url ? (
                    <img src={editFields.cover_url} alt="Cover Artwork" className="page-media-cover" />
                  ) : (
                    <div className="page-media-placeholder">📖</div>
                  )}
                  <label htmlFor="overlay-file-picker" className="overlay-image-upload-cover-lbl">
                    {uploading ? 'Processing...' : '📁 Click or Drag New Artwork'}
                  </label>
                  <input id="overlay-file-picker" type="file" accept="image/*" onChange={(e) => e.target.files[0] && uploadCoverImage(e.target.files[0], 'overlay')} style={{display:'none'}} />
                </div>
                <button type="button" className="page-delete-btn" onClick={() => deleteSeries(selectedSeriesPage.title)}>Purge Content Data</button>
              </div>

              <div className="page-editor-column">
                <h2>Manage Configuration: <span>{selectedSeriesPage.title}</span></h2>
                
                <div className="cyber-form-group">
                  <label>Update Webtoon Title Name</label>
                  <input type="text" value={editFields.title} onChange={(e) => setEditFields({ ...editFields, title: e.target.value })} className="neon-input" />
                </div>

                <div className="edit-split-row">
                  <div className="cyber-form-group">
                    <label>Shelf Tracker Status</label>
                    <select value={editFields.status} onChange={(e) => setEditFields({ ...editFields, status: e.target.value })} className="neon-select">
                      <option value="Reading">Reading</option>
                      <option value="Plan to Read">Plan to Read</option>
                      <option value="On Hold">On Hold</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                  <div className="cyber-form-group">
                    <label>Comic Format Type</label>
                    <select value={editFields.type} onChange={(e) => setEditFields({ ...editFields, type: e.target.value })} className="neon-select">
                      <option value="Manga">Manga</option>
                      <option value="Manhua">Manhua</option>
                      <option value="Manhwa">Manhwa</option>
                    </select>
                  </div>
                  <div className="cyber-form-group">
                    <label>Logged Chapter Location</label>
                    <input type="number" step="0.1" value={editFields.current_chapter} onChange={(e) => setEditFields({ ...editFields, current_chapter: e.target.value })} className="neon-input" />
                  </div>
                </div>

                <div className="links-builder-section-box">
                  <div className="section-header-row-flex">
                    <label className="section-label-txt">Linked Target Source Registries</label>
                    <button type="button" className="add-row-action-pill" onClick={addPageLinkField}>➕ Add Link Input Section</button>
                  </div>

                  <div className="builder-inputs-container-scroll">
                    {pageEditLinks.map((lnkValue, idx) => (
                      <div key={idx} className="builder-input-row-element">
                        <input type="url" placeholder="https://..." value={lnkValue} onChange={(e) => updatePageLinkValue(idx, e.target.value)} className="neon-input entry-field-url" />
                        {lnkValue && <a href={lnkValue} target="_blank" rel="noreferrer" className="row-test-anchor-link">Launch ↗</a>}
                        <button type="button" className="remove-row-action-btn" onClick={() => removePageLinkField(idx)}>❌</button>
                      </div>
                    ))}
                  </div>
                </div>

                <button type="button" className="page-save-btn" onClick={() => handleSaveFullPageOverlayEdits(selectedSeriesPage.title)}>
                  Commit System Modifications
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

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

      <form onSubmit={handleAddSeries} className="premium-form">
        <div className="links-builder-section-box container-main-form">
          <div className="section-header-row-flex">
            <label className="section-label-txt">Associated Bookmarks Registry Locations</label>
            <button type="button" className="add-row-action-pill" onClick={addCreationLinkField}>➕ Add Site Row</button>
          </div>
          
          <div className="builder-inputs-container-scroll">
            {creationLinks.map((lnkValue, idx) => (
              <div key={idx} className="builder-input-row-element">
                <input 
                  type="url" 
                  placeholder={`Site Destination Link #${idx + 1} URL Path`} 
                  value={lnkValue}
                  onChange={(e) => updateCreationLinkValue(idx, e.target.value)}
                  className="neon-input entry-field-url"
                />
                <button type="button" className="remove-row-action-btn" onClick={() => removeCreationLinkField(idx)}>❌</button>
              </div>
            ))}
          </div>
        </div>

        <div className="shelf-row main-fields">
          <input type="text" placeholder="Series Title" value={title} onChange={(e) => setTitle(e.target.value)} required className="neon-input" />
          <div 
            className={`file-upload-wrapper neon-input ${isDraggingMain ? 'drag-active' : ''}`}
            onDragOver={(e) => handleDragOver(e, 'main')}
            onDragLeave={(e) => handleDragLeave(e, 'main')}
            onDrop={handleDropMain}
          >
            <label htmlFor="main-file-input" className="file-label">
              {uploading ? 'Optimizing...' : isDraggingMain ? '💥 Drop Image Here!' : coverUrl ? '✓ Cover Loaded' : '📁 Upload or Drag Cover'}
            </label>
            <input id="main-file-input" type="file" accept="image/*" onChange={handleMainFileChange} disabled={uploading} />
          </div>
        </div>

        <div className="shelf-row control-fields">
          <select value={type} onChange={(e) => setType(e.target.value)} className="neon-select">
            <option value="Manga">Manga</option>
            <option value="Manhua">Manhua</option>
            <option value="Manhwa">Manhwa</option>
          </select>
          <div className="inline-ch-input"><label>Ch:</label><input type="number" step="0.1" value={chapter} onChange={(e) => setChapter(e.target.value)} required /></div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="neon-select">
            <option value="Reading">Reading</option>
            <option value="Plan to Read">Plan to Read</option>
            <option value="On Hold">On Hold</option>
            <option value="Completed">Completed</option>
          </select>
          <button type="submit" className="neon-btn" disabled={uploading}>Track Series</button>
        </div>
      </form>

      <div className="matrix-control-toolbar">
        <div className="toolbar-toggle-buttons">
          <button type="button" className={`tool-btn ${viewMode === 'grid' ? 'active-view' : ''}`} onClick={() => setViewMode('grid')}>🎴 Mosaic View</button>
          <button type="button" className={`tool-btn ${viewMode === 'list' ? 'active-view' : ''}`} onClick={() => setViewMode('list')}>📋 Index View</button>
        </div>
        
        <div className="search-container">
           <input 
             type="text" 
             className="neon-input" 
             placeholder="🔍 Search titles..." 
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
           />
        </div>

        <div className="toolbar-sorting-picker">
          <label>Sort By:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="neon-select minimal-select">
            <option value="title">Alphabetical</option>
            <option value="chapter">Latest Chapters</option>
            <option value="type">Format Class</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="spinner-container"><div className="spinner"></div></div>
      ) : (
        <>
          {viewMode === 'grid' && (
            <div className="premium-grid">
              {processedFilteredData.length === 0 ? (
                <p className="empty-message">Your database shelf is completely clear.</p>
              ) : (
                processedFilteredData.map((item) => {
                  const isCardEditing = editingTitle === item.title
                  const isDraggingOnCard = draggingCardTitle === item.title
                  const derivedLinksArray = parseMultipleLinks(item.reading_url)

                  return (
                    <div key={item.title || Math.random().toString()} className={`premium-card ${isCardEditing ? 'editing-active' : ''}`}>
                      <button type="button" className="glass-delete" onClick={() => deleteSeries(item.title)}>×</button>
                      
                      <div className="image-wrapper">
                        {item.cover_url ? (
                          <img src={item.cover_url} alt={item.title} className="card-cover" />
                        ) : (
                          <div className="card-placeholder-cover">📖</div>
                        )}
                        {!isCardEditing && (
                          <span className={`pill-badge ${(item.type || 'Manga').toLowerCase()}`}>
                            {item.type || 'Manga'}
                          </span>
                        )}
                      </div>

                      <div className="card-body">
                        {isCardEditing ? (
                          <div className="edit-panel-inputs">
                            <label>Title</label>
                            <input type="text" value={editFields.title} onChange={(e) => setEditFields({ ...editFields, title: e.target.value })} className="edit-text-field" />
                            
                            <label>Modify Cover</label>
                            <div 
                              className={`edit-file-wrapper ${isDraggingOnCard ? 'drag-active' : ''}`}
                              onDragOver={(e) => handleDragOver(e, 'card', item.title)}
                              onDragLeave={(e) => handleDragLeave(e, 'card')}
                              onDrop={handleDropEdit}
                            >
                              <label htmlFor={`edit-file-${item.title}`} className="edit-file-label">📁 Click or Drag Image</label>
                              <input id={`edit-file-${item.title}`} type="file" accept="image/*" onChange={handleEditFileChange} disabled={uploading} />
                            </div>

                            <label>Source URLs (Comma Split)</label>
                            <input type="text" value={editFields.reading_url || ''} onChange={(e) => setEditFields({ ...editFields, reading_url: e.target.value })} className="edit-text-field" />

                            <div className="edit-split-row">
                              <div>
                                <label>Type</label>
                                <select value={editFields.type} onChange={(e) => setEditFields({ ...editFields, type: e.target.value })}>
                                  <option value="Manga">Manga</option><option value="Manhua">Manhua</option><option value="Manhwa">Manhwa</option>
                                </select>
                              </div>
                              <div>
                                <label>Chapter</label>
                                <input type="number" step="0.1" value={editFields.current_chapter} onChange={(e) => setEditFields({ ...editFields, current_chapter: e.target.value })} />
                              </div>
                            </div>

                            <label>Status</label>
                            <select value={editFields.status} onChange={(e) => setEditFields({ ...editFields, status: e.target.value })} className="edit-select-field">
                              <option value="Reading">Reading</option><option value="Plan to Read">Plan to Read</option><option value="On Hold">On Hold</option><option value="Completed">Completed</option>
                            </select>

                            <div className="edit-action-buttons">
                              <button type="button" className="save-edit-btn" onClick={() => handleSaveCardEdits(item.title)} disabled={uploading}>Save</button>
                              <button type="button" className="cancel-edit-btn" onClick={() => setEditingTitle(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <h3 className="clickable-title-header" onClick={() => handleOpenOverlayPage(item)} title="Explore Full-Page Complete Configurations Workbench">
                              {item.title || 'Untitled Series'}
                            </h3>
                            
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
                              
                              {derivedLinksArray.length > 0 && (
                                <div className="card-info-sources-flex-row">
                                  {derivedLinksArray.slice(0, 1).map((lnk, i) => (
                                    <a key={i} href={lnk} target="_blank" rel="noreferrer" className="inline-info-badge-anchor" title={lnk}>
                                      🌐 {getDomainName(lnk).substring(0, 9)}..
                                    </a>
                                  ))}
                                </div>
                              )}

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

          {viewMode === 'list' && (
            <div className="premium-list-view-table">
              <div className="table-header-row">
                <span className="col-lbl name">Series Title</span>
                <span className="col-lbl class">Type</span>
                <span className="col-lbl progress">Chapters</span>
                <span className="col-lbl status">🔋 State</span>
                <span className="col-lbl target-links">🔗 Sources</span>
                <span className="col-lbl actions">Operations</span>
              </div>

              {processedFilteredData.map((item) => {
                const linksManifestArray = parseMultipleLinks(item.reading_url)

                return (
                  <div key={item.title || Math.random().toString()} className="table-data-row">
                    <span className="col-data name title-txt" onClick={() => handleOpenOverlayPage(item)} title="Explore Extended Systems Workspace Overlay">{item.title}</span>
                    <span className="col-data class"><span className={`list-badge-chip ${item.type.toLowerCase()}`}>{item.type}</span></span>
                    
                    <span className="col-data progress">
                      <div className="row-inline-counter-align">
                        <button type="button" onClick={() => stepChapter(item.title, item.current_chapter ?? 0, -1)} className="list-row-step-btn">-</button>
                        <strong className="list-row-txt-field">Ch {item.current_chapter ?? 0}</strong>
                        <button type="button" onClick={() => stepChapter(item.title, item.current_chapter ?? 0, 1)} className="list-row-step-btn">+</button>
                      </div>
                    </span>

                    <span className="col-data status">
                      <div className="footer-status-row">
                        <span className={`dot-indicator ${(item.status || 'Reading').toLowerCase().replace(/\s+/g, '-')}`}></span>
                        <span className="status-label">{item.status}</span>
                      </div>
                    </span>

                    <span className="col-data target-links">
                      <div className="list-row-anchors-flex">
                        {linksManifestArray.map((lnk, idx) => (
                          <a key={idx} href={lnk} target="_blank" rel="noreferrer" className="row-anchor-pill" title={lnk}>Log {idx + 1}</a>
                        ))}
                        {linksManifestArray.length === 0 && <span className="no-url-placeholder-lbl">Unlinked</span>}
                      </div>
                    </span>

                    <span className="col-data actions">
                      <div className="list-row-actions-flex">
                        <button type="button" onClick={() => handleOpenOverlayPage(item)} className="list-row-action-btn view">Workspace</button>
                        <button type="button" onClick={() => deleteSeries(item.title)} className="list-row-action-btn purge">Purge</button>
                      </div>
                    </span>
                  </div>
                )
              })}
              {processedFilteredData.length === 0 && <p className="empty-message">No matching shelf tracks found.</p>}
            </div>
          )}
        </>
      )}

    </div>
  )
}

export default App