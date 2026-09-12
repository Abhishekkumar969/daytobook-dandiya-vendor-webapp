import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { LogOut, Check, User as UserIcon, MapPin, Landmark, Calendar, Ticket, Plus, Trash2, ChevronDown, ChevronUp, Image as ImageIcon, UploadCloud, Download } from 'lucide-react';

// Utility: Compress & Convert to WebP
const compressAndConvertToWebP = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        const MAX_SIZE = 1600;
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.8;
        const getBlob = (q) => {
          return new Promise((res) => {
            canvas.toBlob((blob) => {
              res(blob);
            }, 'image/webp', q);
          });
        };

        const process = async () => {
          let blob = await getBlob(quality);
          while (blob.size > 600 * 1024 && quality > 0.1) {
            quality -= 0.1;
            blob = await getBlob(quality);
          }
          const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
            type: 'image/webp',
            lastModified: Date.now()
          });
          resolve(compressedFile);
        };

        process();
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

// Utility: Upload to Cloudinary
const uploadToCloudinary = async (file, folderPath) => {
  const data = new FormData();
  data.append('file', file);
  data.append('upload_preset', 'daytobook_preset');
  data.append('folder', folderPath);

  const res = await fetch(`https://api.cloudinary.com/v1_1/do7z8byh3/image/upload`, {
    method: 'POST',
    body: data,
  });

  const result = await res.json();
  if (!res.ok) {
    throw new Error(result.error?.message || 'Failed to upload image');
  }
  return result.secure_url;
};

function Profile({ user, vendorData }) {
  const [profileData, setProfileData] = useState({
    ownerName: '',
    organizer: '',
    phone: '',
    phone2: '',
    phone3: '',
    name: '',
    category: '',
    date: '',
    time: '',
    about: '',
    venueName: '',
    location: '',
    city: '',
    state: '',
    mapUrl: '',
    beneficiaryName: '',
    accountType: '',
    bankName: '',
    accountNumber: '',
    bankIfsc: ''
  });

  const [passes, setPasses] = useState([]);
  const [initialProfileData, setInitialProfileData] = useState(null);
  const [initialPasses, setInitialPasses] = useState([]);
  const [initialMainImage, setInitialMainImage] = useState(null);
  const [purchasedPassIds, setPurchasedPassIds] = useState(new Set());
  
  // Media State
  const [mainImage, setMainImage] = useState(null);
  const [isUploadingMain, setIsUploadingMain] = useState(false);

  const mainInputRef = useRef(null);

  const [docId, setDocId] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Accordion State
  const [expandedSection, setExpandedSection] = useState(null);
  const [savingSection, setSavingSection] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const cleanEmail = (vendorData?.email || user.email).trim();
        const snapshot = await db.collection("EventTicketRegistration")
          .where("email", "==", cleanEmail)
          .get();

        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          setDocId(doc.id);
          const data = doc.data();

          let p1 = data.phone || '';
          let p2 = data.phone2 || '';
          let p3 = data.phone3 || '';

          if (data.allPhones && Array.isArray(data.allPhones)) {
            p1 = data.allPhones[0] || p1;
            p2 = data.allPhones[1] || p2;
            p3 = data.allPhones[2] || p3;
          }

          const fetchedProfileData = {
            ownerName: data.ownerName || data.firstName || '',
            organizer: data.organizer || data.companyName || '',
            phone: p1,
            phone2: p2,
            phone3: p3,
            name: data.name || '',
            category: data.category || '',
            date: data.date || '',
            time: data.time || '',
            about: data.about || '',
            venueName: data.venueName || '',
            location: data.location || '',
            city: data.city || '',
            state: data.state || '',
            mapUrl: data.mapUrl || '',
            beneficiaryName: data.beneficiaryName || '',
            accountType: data.accountType || '',
            bankName: data.bankName || '',
            accountNumber: data.accountNumber || '',
            bankIfsc: data.bankIfsc || ''
          };
          setProfileData(fetchedProfileData);
          setInitialProfileData(fetchedProfileData);

          const fetchedPasses = (data.passes && Array.isArray(data.passes)) ? JSON.parse(JSON.stringify(data.passes)) : [];
          setPasses(fetchedPasses);
          setInitialPasses(JSON.parse(JSON.stringify(fetchedPasses)));

          if (data.image) {
            setMainImage(data.image);
            setInitialMainImage(data.image);
          }
          
          // Fetch sold passes to prevent editing names
          const collectionName = `${cleanEmail.toLowerCase()}_ticket`;
          const ticketsSnap = await db.collection(collectionName).get();
          const soldIds = new Set();
          ticketsSnap.forEach(tDoc => {
            const tData = tDoc.data();
            if (tData.passes && Array.isArray(tData.passes)) {
              tData.passes.forEach(p => {
                if (p.passId) soldIds.add(p.passId);
                if (p.name) soldIds.add(p.name);
              });
            }
          });
          setPurchasedPassIds(soldIds);

        } else {
          setError('Profile not found.');
        }
      } catch (err) {
        console.error("Error fetching profile: ", err);
        setError('Failed to load profile.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user, vendorData]);

  const isSectionDirty = (sectionName) => {
    if (!initialProfileData) return false;
    
    const ts = (val) => (val || '').toString().trim();

    if (sectionName === 'Contact Info') {
      return ts(profileData.ownerName) !== ts(initialProfileData.ownerName) ||
             ts(profileData.organizer) !== ts(initialProfileData.organizer) ||
             ts(profileData.phone) !== ts(initialProfileData.phone) ||
             ts(profileData.phone2) !== ts(initialProfileData.phone2) ||
             ts(profileData.phone3) !== ts(initialProfileData.phone3);
    }
    if (sectionName === 'Event Details') {
      return ts(profileData.name) !== ts(initialProfileData.name) ||
             ts(profileData.category) !== ts(initialProfileData.category) ||
             ts(profileData.date) !== ts(initialProfileData.date) ||
             ts(profileData.time) !== ts(initialProfileData.time) ||
             ts(profileData.about) !== ts(initialProfileData.about) ||
             mainImage !== initialMainImage;
    }
    if (sectionName === 'Venue Details') {
      return ts(profileData.venueName) !== ts(initialProfileData.venueName) ||
             ts(profileData.location) !== ts(initialProfileData.location) ||
             ts(profileData.city) !== ts(initialProfileData.city) ||
             ts(profileData.state) !== ts(initialProfileData.state) ||
             ts(profileData.mapUrl) !== ts(initialProfileData.mapUrl);
    }
    if (sectionName === 'Bank Details') {
      return ts(profileData.beneficiaryName) !== ts(initialProfileData.beneficiaryName) ||
             ts(profileData.accountType) !== ts(initialProfileData.accountType) ||
             ts(profileData.bankName) !== ts(initialProfileData.bankName) ||
             ts(profileData.accountNumber) !== ts(initialProfileData.accountNumber) ||
             ts(profileData.bankIfsc) !== ts(initialProfileData.bankIfsc);
    }
    if (sectionName === 'Event Passes') {
      // Need to compare passes after trimming string fields
      const cleanPasses = passes.map(p => ({
        ...p,
        name: ts(p.name),
        description: ts(p.description),
        price: ts(p.price),
        limit: ts(p.limit)
      }));
      const cleanInitialPasses = initialPasses.map(p => ({
        ...p,
        name: ts(p.name),
        description: ts(p.description),
        price: ts(p.price),
        limit: ts(p.limit)
      }));
      return JSON.stringify(cleanPasses) !== JSON.stringify(cleanInitialPasses);
    }
    return false;
  };

  const handleChange = (e) => {
    setProfileData({
      ...profileData,
      [e.target.name]: e.target.value
    });
  };

  const handlePassChange = (index, field, value) => {
    const newPasses = [...passes];
    newPasses[index] = { ...newPasses[index], [field]: value };
    setPasses(newPasses);
  };

  const addPass = () => {
    const passId = Math.random().toString(36).substring(2, 15);
    setPasses([...passes, { passId, name: '', price: '', description: '', limit: '' }]);
  };

  const removePass = (index) => {
    const newPasses = passes.filter((_, i) => i !== index);
    setPasses(newPasses);
  };

  const toggleSection = (sectionName) => {
    if (expandedSection === sectionName) {
      setExpandedSection(null);
    } else {
      setExpandedSection(sectionName);
    }
  };

  // Media Handlers
  const handleMainImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !docId) return;

    setIsUploadingMain(true);
    setError('');
    setMessage('');
    try {
      const compressed = await compressAndConvertToWebP(file);
      const cleanEmail = (vendorData?.email || user.email).replace(/[^a-zA-Z0-9]/g, '_');
      const folderPath = `Event Ticket/${(profileData.city || 'general').toLowerCase()}_${cleanEmail}`;
      const url = await uploadToCloudinary(compressed, folderPath);
      
      setMainImage(url);
      setMessage('Banner image uploaded! Click tick to save everything.');
    } catch (err) {
      console.error(err);
      setError("Failed to process and upload image.");
    } finally {
      setIsUploadingMain(false);
    }
  };

  const handleSave = async (e, sectionName) => {
    if (e) e.stopPropagation();
    if (!docId) return;

    setSavingSection(sectionName);
    setMessage('');
    setError('');

    try {
      const dataToSave = {
        ownerName: profileData.ownerName,
        organizer: profileData.organizer,
        phone: profileData.phone,
        phone2: profileData.phone2,
        phone3: profileData.phone3,
        allPhones: [profileData.phone, profileData.phone2, profileData.phone3].filter(p => p.trim() !== ''),
        name: profileData.name,
        category: profileData.category,
        date: profileData.date,
        time: profileData.time,
        about: profileData.about,
        venueName: profileData.venueName,
        location: profileData.location,
        city: profileData.city,
        state: profileData.state,
        mapUrl: profileData.mapUrl,
        beneficiaryName: profileData.beneficiaryName,
        accountType: profileData.accountType,
        bankName: profileData.bankName,
        accountNumber: profileData.accountNumber,
        bankIfsc: profileData.bankIfsc,
        passes: passes,
        image: mainImage,
        updatedAt: new Date().toISOString()
      };

      await db.collection("EventTicketRegistration").doc(docId).set(dataToSave, { merge: true });
      setMessage(`${sectionName} saved successfully!`);
      
      // Update initial state to reflect saved data
      setInitialProfileData({...profileData});
      setInitialPasses([...passes]);
      setInitialMainImage(mainImage);

      setTimeout(() => setMessage(''), 3000);
      setExpandedSection(null);
    } catch (err) {
      console.error("Error updating profile: ", err);
      setError('Failed to save changes.');
    } finally {
      setSavingSection(null);
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  const handleDownloadApp = () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      alert("To install on iOS: Tap the 'Share' icon at the bottom of your Safari browser, then select 'Add to Home Screen'.");
      return;
    }

    if (window.deferredPrompt) {
      window.deferredPrompt.prompt();
      window.deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        } else {
          console.log('User dismissed the install prompt');
        }
        window.deferredPrompt = null;
      });
    } else {
      alert("App is already installed, or installation is not supported on this browser.");
    }
  };

  if (loading) {
    return <div className="loading-screen">Loading Profile...</div>;
  }

  return (
    <div className="records-container" style={{ paddingBottom: '2rem' }}>
      <div className="records-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Profile</h2>
          <p>Manage your event registration details</p>
        </div>
        <button onClick={handleLogout} style={{ background: 'var(--bg-surface-light)', border: '1px solid var(--border-color)', color: 'var(--error-color)', padding: '6px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' }}>
          <LogOut size={16} />
          Logout
        </button>
      </div>

      <div className="login-box" style={{ maxWidth: '100%', padding: '1rem 10px' }}>
        
        {message && <div className="success-toast">{message}</div>}
        {error && <div className="error-toast">{error}</div>}

        {/* Section 1: Basic Info */}
        <div className={`accordion-item ${expandedSection === 'Contact Info' ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection('Contact Info')}>
            <div className="accordion-title">
              <UserIcon size={18} />Contact Info
            </div>
            <div className="accordion-actions">
              {expandedSection === 'Contact Info' && (
                <button className="save-tick-btn" onClick={(e) => handleSave(e, 'Contact Info')} disabled={savingSection === 'Contact Info' || !isSectionDirty('Contact Info')}>
                  <Check size={20} />
                </button>
              )}
              {expandedSection === 'Contact Info' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </div>
          <div className="accordion-body">
            <div className="form-group">
              <label>Email Address (Login ID)</label>
              <input type="email" value={user.email} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
            </div>
            <div className="form-row">
              <div className="form-group half">
                <label>Owner Name</label>
                <input type="text" name="ownerName" value={profileData.ownerName} onChange={handleChange} required />
              </div>
              <div className="form-group half">
                <label>Organizer / Company Name</label>
                <input type="text" name="organizer" value={profileData.organizer} onChange={handleChange} required />
              </div>
            </div>
            <div className="form-group">
              <label>Primary Phone</label>
              <input type="tel" name="phone" value={profileData.phone} onChange={handleChange} required />
            </div>
            <div className="form-row">
              <div className="form-group half">
                <label>Alternate Phone 2</label>
                <input type="tel" name="phone2" value={profileData.phone2} onChange={handleChange} />
              </div>
              <div className="form-group half">
                <label>Alternate Phone 3</label>
                <input type="tel" name="phone3" value={profileData.phone3} onChange={handleChange} />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Event Details & Media */}
        <div className={`accordion-item ${expandedSection === 'Event Details' ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection('Event Details')}>
            <div className="accordion-title">
              <Calendar size={18} /> Event Details & Media
            </div>
            <div className="accordion-actions">
              {expandedSection === 'Event Details' && (
                <button className="save-tick-btn" onClick={(e) => handleSave(e, 'Event Details')} disabled={savingSection === 'Event Details' || isUploadingMain || !isSectionDirty('Event Details')}>
                  <Check size={20} />
                </button>
              )}
              {expandedSection === 'Event Details' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </div>
          <div className="accordion-body">
            <div className="form-row">
              <div className="form-group half">
                <label>Event Name</label>
                <input type="text" name="name" value={profileData.name} onChange={handleChange} required />
              </div>
              <div className="form-group half">
                <label>Category</label>
                <input type="text" name="category" value={profileData.category} onChange={handleChange} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group half">
                <label>Event Date</label>
                <input type="date" name="date" value={profileData.date} onChange={handleChange} required />
              </div>
              <div className="form-group half">
                <label>Event Time</label>
                <input type="time" name="time" value={profileData.time} onChange={handleChange} required />
              </div>
            </div>
            <div className="form-group">
              <label>About the Event</label>
              <textarea name="about" value={profileData.about} onChange={handleChange} rows={4} className="custom-textarea" />
            </div>
            
            <hr className="divider" style={{ margin: '1rem 0' }} />
            
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <ImageIcon size={18} /> Main Banner Photo
              </label>
              <div className="media-upload-area" onClick={() => mainInputRef.current?.click()}>
                {isUploadingMain ? (
                  <p>Uploading and Compressing...</p>
                ) : mainImage ? (
                  <img src={mainImage} alt="Banner Preview" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '8px' }} />
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', border: '2px dashed var(--border-color)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <UploadCloud size={32} style={{ margin: '0 auto 0.5rem auto', display: 'block' }}/>
                    <p>Click to upload banner</p>
                  </div>
                )}
              </div>
              <input type="file" accept="image/*" ref={mainInputRef} style={{ display: 'none' }} onChange={handleMainImageChange} />
            </div>

          </div>
        </div>

        {/* Section 3: Venue Details */}
        <div className={`accordion-item ${expandedSection === 'Venue Details' ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection('Venue Details')}>
            <div className="accordion-title">
              <MapPin size={18} /> Venue Details
            </div>
            <div className="accordion-actions">
              {expandedSection === 'Venue Details' && (
                <button className="save-tick-btn" onClick={(e) => handleSave(e, 'Venue Details')} disabled={savingSection === 'Venue Details' || !isSectionDirty('Venue Details')}>
                  <Check size={20} />
                </button>
              )}
              {expandedSection === 'Venue Details' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </div>
          <div className="accordion-body">
            <div className="form-group">
              <label>Venue Name</label>
              <input type="text" name="venueName" value={profileData.venueName} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Full Address</label>
              <input type="text" name="location" value={profileData.location} onChange={handleChange} required />
            </div>
            <div className="form-row">
              <div className="form-group half">
                <label>City</label>
                <input type="text" name="city" value={profileData.city} onChange={handleChange} required />
              </div>
              <div className="form-group half">
                <label>State</label>
                <input type="text" name="state" value={profileData.state} onChange={handleChange} required />
              </div>
            </div>
            <div className="form-group">
              <label>Google Maps URL</label>
              <input type="url" name="mapUrl" value={profileData.mapUrl} onChange={handleChange} />
            </div>
          </div>
        </div>

        {/* Section 4: Event Passes */}
        <div className={`accordion-item ${expandedSection === 'Event Passes' ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection('Event Passes')}>
            <div className="accordion-title">
              <Ticket size={18} /> Event Passes
            </div>
            <div className="accordion-actions">
              {expandedSection === 'Event Passes' && (
                <button className="save-tick-btn" onClick={(e) => handleSave(e, 'Event Passes')} disabled={savingSection === 'Event Passes' || !isSectionDirty('Event Passes')}>
                  <Check size={20} />
                </button>
              )}
              {expandedSection === 'Event Passes' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </div>
          <div className="accordion-body">
            <div className="passes-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {passes.map((pass, index) => {
                const isPurchased = purchasedPassIds.has(pass.passId) || purchasedPassIds.has(pass.name);
                return (
                  <div key={pass.passId || index} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--bg-color)', position: 'relative' }}>
                    {!isPurchased && (
                      <button type="button" onClick={() => removePass(index)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'var(--error-color)', cursor: 'pointer' }}>
                        <Trash2 size={18} />
                      </button>
                    )}
                    <div className="form-group" style={{ paddingRight: '2rem' }}>
                      <label>Pass Name {isPurchased && <span style={{ color: 'var(--error-color)', fontSize: '0.8rem' }}>(Purchased - Cannot change name)</span>}</label>
                      <input type="text" value={pass.name} onChange={(e) => handlePassChange(index, 'name', e.target.value)} disabled={isPurchased} required />
                    </div>
                    <div className="form-row">
                      <div className="form-group half">
                        <label>Price (₹)</label>
                        <input type="number" min="0" value={pass.price} onChange={(e) => handlePassChange(index, 'price', e.target.value)} required />
                      </div>
                      <div className="form-group half">
                        <label>Limit / Max Capacity</label>
                        <input type="number" min="0" value={pass.limit} onChange={(e) => handlePassChange(index, 'limit', e.target.value)} placeholder="Leave blank if unlimited" />
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Description / Perks</label>
                      <input type="text" value={pass.description} onChange={(e) => handlePassChange(index, 'description', e.target.value)} />
                    </div>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={addPass} style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-surface-light)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>
              <Plus size={18} /> Add Another Pass
            </button>
          </div>
        </div>

        {/* Section 5: Bank Details */}
        <div className={`accordion-item ${expandedSection === 'Bank Details' ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection('Bank Details')}>
            <div className="accordion-title">
              <Landmark size={18} /> Bank Details
            </div>
            <div className="accordion-actions">
              {expandedSection === 'Bank Details' && (
                <button className="save-tick-btn" onClick={(e) => handleSave(e, 'Bank Details')} disabled={savingSection === 'Bank Details' || !isSectionDirty('Bank Details')}>
                  <Check size={20} />
                </button>
              )}
              {expandedSection === 'Bank Details' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </div>
          <div className="accordion-body">
            <div className="form-row">
              <div className="form-group half">
                <label>Beneficiary Name</label>
                <input type="text" name="beneficiaryName" value={profileData.beneficiaryName} onChange={handleChange} />
              </div>
              <div className="form-group half">
                <label>Account Type</label>
                <select name="accountType" value={profileData.accountType} onChange={handleChange} className="custom-select">
                  <option value="">Select Type</option>
                  <option value="Savings">Savings</option>
                  <option value="Current">Current</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Bank Name</label>
              <input type="text" name="bankName" value={profileData.bankName} onChange={handleChange} />
            </div>
            <div className="form-row">
              <div className="form-group half">
                <label>Account Number</label>
                <input type="text" name="accountNumber" value={profileData.accountNumber} onChange={handleChange} />
              </div>
              <div className="form-group half">
                <label>IFSC Code</label>
                <input type="text" name="bankIfsc" value={profileData.bankIfsc} onChange={handleChange} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '3rem', borderTop: '1px solid var(--border-color)', paddingTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button onClick={handleDownloadApp} className="primary-btn" style={{ backgroundColor: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: 0 }}>
            <Download size={20} />
            Download App (APK / iOS)
          </button>
        </div>
      </div>
    </div>
  );
}

export default Profile;
