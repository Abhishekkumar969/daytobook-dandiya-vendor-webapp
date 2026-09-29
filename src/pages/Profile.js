import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { LogOut, Check, Copy, User as UserIcon, Calendar, Ticket, Plus, Trash2, ChevronDown, ChevronUp, Image as ImageIcon, UploadCloud, Download, Users, Handshake } from 'lucide-react';

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
    status: '',
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
    bankIfsc: '',
    opened: 0
  });

  const [passes, setPasses] = useState([]);
  const [artists, setArtists] = useState([]);
  const [partners, setPartners] = useState([]);
  const [initialProfileData, setInitialProfileData] = useState(null);
  const [initialPasses, setInitialPasses] = useState([]);
  const [initialArtists, setInitialArtists] = useState([]);
  const [initialPartners, setInitialPartners] = useState([]);
  const [initialMainImage, setInitialMainImage] = useState(null);
  const [purchasedPassIds, setPurchasedPassIds] = useState(new Set());
  const [uploadingArtistIndex, setUploadingArtistIndex] = useState(null);
  const [uploadingPartnerIndex, setUploadingPartnerIndex] = useState(null);

  // Media State
  const [mainImage, setMainImage] = useState(null);
  const [isUploadingMain, setIsUploadingMain] = useState(false);

  const mainInputRef = useRef(null);
  const autoOpenRef = useRef(false);

  const [docId, setDocId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Accordion State
  const [expandedSection, setExpandedSection] = useState(null);
  const [savingSection, setSavingSection] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    const cleanEmail = (vendorData?.email || user.email).trim();
    let unsubscribeProfile = () => { };
    let unsubscribeTickets = () => { };

    try {
      unsubscribeProfile = db.collection("EventTicketRegistration")
        .where("email", "==", cleanEmail)
        .onSnapshot((snapshot) => {
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
              status: data.status || '',
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
              bankIfsc: data.bankIfsc || '',
              opened: data.opened || 0
            };
            setProfileData(fetchedProfileData);
            setInitialProfileData(fetchedProfileData);

            const fetchedPasses = (data.passes && Array.isArray(data.passes)) ? JSON.parse(JSON.stringify(data.passes)) : [];
            setPasses(fetchedPasses);
            setInitialPasses(JSON.parse(JSON.stringify(fetchedPasses)));

            const fetchedArtists = (data.artists && Array.isArray(data.artists)) ? data.artists : [];
            setArtists(fetchedArtists);
            setInitialArtists(JSON.parse(JSON.stringify(fetchedArtists)));

            const fetchedPartners = (data.partners && Array.isArray(data.partners)) ? data.partners : [];
            setPartners(fetchedPartners);
            setInitialPartners(JSON.parse(JSON.stringify(fetchedPartners)));

            if (data.image) {
              setMainImage(data.image);
              setInitialMainImage(data.image);
            }
          } else {
            setError('Profile not found.');
          }
          setLoading(false);
        }, (err) => {
          console.error("Error fetching profile: ", err);
          setError('Failed to load profile.');
          setLoading(false);
        });

      const collectionName = `Payments/EventTickets/Transactions`;
      unsubscribeTickets = db.collection(collectionName).onSnapshot((ticketsSnap) => {
        const soldIds = new Set();
        ticketsSnap.forEach(tDoc => {
          const tData = tDoc.data();
          if (tData.payment && tData.payment.razorpayPaymentId) {
            if (tData.passes && Array.isArray(tData.passes)) {
              tData.passes.forEach(p => {
                if (p.passId) {
                  soldIds.add(p.passId);
                }
                if (p.name) {
                  soldIds.add(p.name);
                }
              });
            }
          }
        });
        setPurchasedPassIds(soldIds);
      }, (err) => {
        console.error("Error fetching tickets: ", err);
      });

    } catch (err) {
      console.error(err);
      setError('Failed to load profile.');
      setLoading(false);
    }

    return () => {
      unsubscribeProfile();
      unsubscribeTickets();
    };
  }, [user, vendorData]);

  useEffect(() => {
    if (loading || autoOpenRef.current) return;
    autoOpenRef.current = true;
  }, [loading]);
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
      return ts(profileData.about) !== ts(initialProfileData.about) ||
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
        price: ts(p.price)
      }));
      const cleanInitialPasses = initialPasses.map(p => ({
        ...p,
        name: ts(p.name),
        description: ts(p.description),
        price: ts(p.price)
      }));
      return JSON.stringify(cleanPasses) !== JSON.stringify(cleanInitialPasses);
    }
    if (sectionName === 'Event Artists') {
      return JSON.stringify(artists) !== JSON.stringify(initialArtists);
    }
    if (sectionName === 'Event Partners') {
      return JSON.stringify(partners) !== JSON.stringify(initialPartners);
    }

    return false;
  };

  const isAnySectionDirty = () => {
    return isSectionDirty('Contact Info') ||
      isSectionDirty('Event Details') ||
      isSectionDirty('Event Artists') ||
      isSectionDirty('Event Partners') ||
      isSectionDirty('Venue Details') ||
      isSectionDirty('Bank Details') ||
      isSectionDirty('Event Passes');
  };

  const handleChange = (e) => {
    setProfileData({
      ...profileData,
      [e.target.name]: e.target.value
    });
  };

  const handlePassChange = (index, field, value) => {
    if ((field === 'price' || field === 'limit') && value !== '') {
      value = value.toString().replace(/[^0-9]/g, '');
    }
    const newPasses = [...passes];
    newPasses[index] = { ...newPasses[index], [field]: value };
    setPasses(newPasses);
  };

  const handleKeyDownInt = (e) => {
    if (e.key === '.' || e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') {
      e.preventDefault();
    }
  };

  const handleArtistChange = (index, field, value) => {
    const newArtists = [...artists];
    newArtists[index] = { ...newArtists[index], [field]: value };
    setArtists(newArtists);
  };
  const addArtist = () => setArtists([...artists, { id: Date.now(), name: '', role: '', image: '' }]);
  const removeArtist = (index) => setArtists(artists.filter((_, i) => i !== index));

  const handlePartnerChange = (index, field, value) => {
    const newPartners = [...partners];
    newPartners[index] = { ...newPartners[index], [field]: value };
    setPartners(newPartners);
  };
  const addPartner = () => setPartners([...partners, { id: Date.now(), name: '', role: '', image: '' }]);
  const removePartner = (index) => setPartners(partners.filter((_, i) => i !== index));

  const handleArtistImageUpload = async (e, index) => {
    const file = e.target.files[0];
    if (!file || !docId) return;
    setUploadingArtistIndex(index);
    try {
      const compressed = await compressAndConvertToWebP(file);
      const cleanEmail = (vendorData?.email || user.email).replace(/[^a-zA-Z0-9]/g, '_');
      const folderPath = `Event Ticket/${(profileData.city || 'general').toLowerCase()}_${cleanEmail}/artists`;
      const url = await uploadToCloudinary(compressed, folderPath);
      handleArtistChange(index, 'image', url);
    } catch (err) {
      console.error(err);
      setError("Failed to upload artist image.");
    } finally {
      setUploadingArtistIndex(null);
    }
  };

  const handlePartnerImageUpload = async (e, index) => {
    const file = e.target.files[0];
    if (!file || !docId) return;
    setUploadingPartnerIndex(index);
    try {
      const compressed = await compressAndConvertToWebP(file);
      const cleanEmail = (vendorData?.email || user.email).replace(/[^a-zA-Z0-9]/g, '_');
      const folderPath = `Event Ticket/${(profileData.city || 'general').toLowerCase()}_${cleanEmail}/partners`;
      const url = await uploadToCloudinary(compressed, folderPath);
      handlePartnerChange(index, 'image', url);
    } catch (err) {
      console.error(err);
      setError("Failed to upload partner image.");
    } finally {
      setUploadingPartnerIndex(null);
    }
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
        artists: artists,
        partners: partners,
        image: mainImage,
        updatedAt: new Date().toISOString()
      };

      await db.collection("EventTicketRegistration").doc(docId).set(dataToSave, { merge: true });
      setMessage('Saved');

      // Update initial state to reflect saved data
      setInitialProfileData({ ...profileData });
      setInitialPasses([...passes]);
      setInitialArtists([...artists]);
      setInitialPartners([...partners]);
      setInitialMainImage(mainImage);

      setTimeout(() => setMessage(''), 1000);
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



  const getSectionCompletion = (section) => {
    let filled = 0;
    let total = 1;
    const isApproved = profileData.status === 'approved';
    switch (section) {
      case 'Contact Info':
        if (isApproved) {
          total = 3;
          filled = [profileData.phone, profileData.phone2, profileData.phone3].filter(v => v && v.toString().trim() !== '').length;
        } else {
          total = 5;
          filled = [profileData.ownerName, profileData.organizer, profileData.phone, profileData.phone2, profileData.phone3].filter(v => v && v.toString().trim() !== '').length;
        }
        break;
      case 'Event Details':
        total = 2;
        filled = [profileData.about, mainImage].filter(v => v && v.toString().trim() !== '').length;
        break;
      case 'Event Artists':
        total = 1;
        filled = artists.length > 0 ? 1 : 0;
        break;
      case 'Event Partners':
        total = 1;
        filled = partners.length > 0 ? 1 : 0;
        break;
      case 'Event Passes':
        total = 1;
        filled = passes.length > 0 ? 1 : 0;
        break;

      default:
        total = 1;
        filled = 1;
    }
    return Math.round((filled / total) * 100);
  };

  const renderPercentage = (section) => {
    const percent = getSectionCompletion(section);
    if (percent === 100) return null;

    let color = 'var(--error-color)';
    if (percent > 0) color = 'var(--warning-color)';

    return (
      <span style={{
        marginLeft: '10px',
        fontSize: '0.8rem',
        color: color,
        fontWeight: 'bold',
        background: 'transparent',
        padding: '2px 6px',
        borderRadius: '4px',
        border: `1px solid ${color}`
      }}>
        {percent}%
      </span>
    );
  };

  if (loading) {
    return <div className="loading-screen">Loading Profile...</div>;
  }



  const isAnyPassInvalid = passes.some(pass => {
    const nameStr = (pass.name || '').toString().trim();
    const priceStr = (pass.price || '').toString().trim();
    return nameStr === '' || priceStr === '';
  });

  return (
    <div className="records-container" style={{ paddingBottom: '2rem' }}>
      <div className="records-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100, backgroundColor: 'var(--bg-color)', padding: '1rem' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            Profile 
            <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>
              ({profileData.opened || 0} views)
            </span>
          </h2>
        </div>
      </div>

      <div className="login-box" style={{ maxWidth: '100%', padding: '1rem 10px' }}>

        {profileData.status === 'pending' && (
          <div style={{ backgroundColor: 'var(--warning-bg, #fff3cd)', color: 'var(--warning-text, #856404)', padding: '12px', borderRadius: '8px', marginBottom: '16px', border: '1px solid var(--warning-border, #ffeeba)', textAlign: 'center', fontWeight: 'bold' }}>
            Your record verification is in pending
          </div>
        )}

        {message && <div className="floating-success-toast">{message}</div>}
        {error && <div className="error-toast">{error}</div>}



        {/* Event Link & QR Code */}
        {profileData.status === 'approved' && (
          <div style={{ marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
            {(() => {
              const formatStr = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
              const categoryInCity = `${formatStr(profileData.category || 'events')}-in-${formatStr(profileData.city || 'india')}`;
              const venueInCity = `${formatStr(profileData.venueName || 'venue')}-${formatStr(profileData.city || 'india')}`;
              const nameSlug = formatStr(profileData.name || 'hardcoded-event');
              const eventUrl = `https://daytobook.com/event-tickets/${categoryInCity}/${venueInCity}/${nameSlug}`;
              const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(eventUrl)}`;

              const downloadQR = async () => {
                try {
                  const response = await fetch(qrUrl);
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.style.display = 'none';
                  a.href = url;
                  a.download = `${nameSlug}-QR.png`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                } catch (err) {
                  console.error('Error downloading QR code:', err);
                  window.open(qrUrl, '_blank');
                }
              };

              return (
                <>
                  {/* Logo Container (Left) */}
                  <div style={{ flex: '1 1 300px', padding: '20px', backgroundColor: 'var(--bg-color)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>Logo for Banner</h3>
                    <div style={{ width: '150px', height: '150px', borderRadius: '8px', border: '2px solid var(--border-color)', padding: '5px', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src="/DayToBook_Logo.png" alt="DayToBook Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    </div>
                    <a href="/DayToBook_Logo.png" download="DayToBook_Logo.png" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-surface-light)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: '500', textDecoration: 'none' }} title="Download Logo">
                      <Download size={18} /> Download
                    </a>
                  </div>

                  {/* QR Code Container (Right) */}
                  <div style={{ flex: '1 1 300px', padding: '20px', backgroundColor: 'var(--bg-color)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>My Passes</h3>
                    <img src={qrUrl} alt="Event QR Code" style={{ width: '150px', height: '150px', borderRadius: '8px', border: '2px solid var(--border-color)', padding: '5px', backgroundColor: 'white' }} />
                    <button onClick={downloadQR} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-surface-light)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: '500' }} title="Download QR">
                      <Download size={18} /> Download
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: '500' }}>Link for Insta Bio</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(eventUrl);
                          setCopiedLink(true);
                          setTimeout(() => setCopiedLink(false), 2000);
                        }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', borderRadius: '6px', border: 'none', background: copiedLink ? 'var(--success-color)' : 'var(--primary-color)', color: 'white', cursor: 'pointer', width: '36px', height: '36px' }}
                        title="Copy Link"
                      >
                        {copiedLink ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                </>);
            })()}
          </div>
        )}


        {/* Section 4: Event Passes */}
        <div className={`accordion-item ${expandedSection === 'Event Passes' ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection('Event Passes')}>
            <div className="accordion-title">
              <Ticket size={18} /> Event Passes {renderPercentage('Event Passes')}
            </div>
            <div className="accordion-actions">
              {expandedSection === 'Event Passes' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </div>
          <div className="accordion-body">
            {/* Limit Alerts Removed as requested */}

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
                      <div className="form-group half" style={{ width: '100%' }}>
                        <label>Price (₹)</label>
                        <input type="number" min="0" step="1" value={pass.price} onKeyDown={handleKeyDownInt} onChange={(e) => handlePassChange(index, 'price', e.target.value)} required />
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Features separated with comma</label>
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

        {/* Event Artists Section */}
        <div className={`accordion-item ${expandedSection === 'Event Artists' ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection('Event Artists')}>
            <div className="accordion-title">
              <Users size={18} /> Event Artists {renderPercentage('Event Artists')}
            </div>
            <div className="accordion-actions">
              {expandedSection === 'Event Artists' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </div>
          <div className="accordion-body">
            <div className="passes-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {artists.map((artist, index) => (
                <div key={artist.id || index} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--bg-color)', position: 'relative' }}>
                  <button type="button" onClick={() => removeArtist(index)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'var(--error-color)', cursor: 'pointer', zIndex: 10 }}>
                    <Trash2 size={18} />
                  </button>
                  <div className="form-row" style={{ alignItems: 'flex-start' }}>
                    <div style={{ flex: '0 0 100px', marginRight: '1rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Photo</label>
                      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100px', height: '100px', border: '1px dashed var(--border-color)', borderRadius: '8px', cursor: 'pointer', overflow: 'hidden', position: 'relative' }}>
                        {uploadingArtistIndex === index ? (
                          <span style={{ fontSize: '0.8rem' }}>Uploading...</span>
                        ) : artist.image ? (
                          <img src={artist.image} alt="Artist" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <>
                            <UploadCloud size={24} style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }} />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: '1.2' }}>
                              Upload<br />(9:16)<br />Portrait
                            </span>
                          </>
                        )}
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleArtistImageUpload(e, index)} />
                      </label>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Name</label>
                        <input type="text" value={artist.name} onChange={(e) => handleArtistChange(index, 'name', e.target.value)} required />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Role / Instrument</label>
                        <input type="text" value={artist.role} onChange={(e) => handleArtistChange(index, 'role', e.target.value)} required />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={addArtist} style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-surface-light)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>
              <Plus size={18} /> Add Artist
            </button>
          </div>
        </div>

        {/* Event Partners Section */}
        <div className={`accordion-item ${expandedSection === 'Event Partners' ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection('Event Partners')}>
            <div className="accordion-title">
              <Handshake size={18} /> Event Partners {renderPercentage('Event Partners')}
            </div>
            <div className="accordion-actions">
              {expandedSection === 'Event Partners' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </div>
          <div className="accordion-body">
            <div className="passes-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {partners.map((partner, index) => (
                <div key={partner.id || index} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--bg-color)', position: 'relative' }}>
                  <button type="button" onClick={() => removePartner(index)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'var(--error-color)', cursor: 'pointer', zIndex: 10 }}>
                    <Trash2 size={18} />
                  </button>
                  <div className="form-row" style={{ alignItems: 'flex-start' }}>
                    <div style={{ flex: '0 0 100px', marginRight: '1rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Logo/Photo</label>
                      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100px', height: '100px', border: '1px dashed var(--border-color)', borderRadius: '8px', cursor: 'pointer', overflow: 'hidden', position: 'relative' }}>
                        {uploadingPartnerIndex === index ? (
                          <span style={{ fontSize: '0.8rem' }}>Uploading...</span>
                        ) : partner.image ? (
                          <img src={partner.image} alt="Partner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <>
                            <UploadCloud size={24} style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }} />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: '1.2' }}>
                              Upload<br />(9:16)<br />Portrait
                            </span>
                          </>
                        )}
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handlePartnerImageUpload(e, index)} />
                      </label>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Partner Name</label>
                        <input type="text" value={partner.name} onChange={(e) => handlePartnerChange(index, 'name', e.target.value)} required />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Role / Type (e.g. Sponsor)</label>
                        <input type="text" value={partner.role} onChange={(e) => handlePartnerChange(index, 'role', e.target.value)} required />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={addPartner} style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-surface-light)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>
              <Plus size={18} /> Add Partner
            </button>
          </div>
        </div>


        {/* Section 2: Event Details & Media */}
        <div className={`accordion-item ${expandedSection === 'Event Details' ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection('Event Details')}>
            <div className="accordion-title">
              <Calendar size={18} /> Event Details & Media {renderPercentage('Event Details')}
            </div>
            <div className="accordion-actions">
              {expandedSection === 'Event Details' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </div>
          <div className="accordion-body">

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
                    <UploadCloud size={32} style={{ margin: '0 auto 0.5rem auto', display: 'block' }} />
                    <p>Click to upload banner</p>
                  </div>
                )}
              </div>
              <input type="file" accept="image/*" ref={mainInputRef} style={{ display: 'none' }} onChange={handleMainImageChange} />
            </div>

          </div>
        </div>

        {/* Section 1: Basic Info */}
        <div className={`accordion-item ${expandedSection === 'Contact Info' ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection('Contact Info')}>
            <div className="accordion-title">
              <UserIcon size={18} />Contact Info {renderPercentage('Contact Info')}
            </div>
            <div className="accordion-actions">
              {expandedSection === 'Contact Info' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </div>
          <div className="accordion-body">

            {profileData.status !== 'approved' && (
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
            )}
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

        <div style={{ marginTop: '3rem', borderTop: '1px solid var(--border-color)', paddingTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>



          <button onClick={handleLogout} style={{ background: 'transparent', border: '1px solid var(--error-color)', color: 'var(--error-color)', padding: '10px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '1rem', fontWeight: '500', alignSelf: 'flex-start', marginTop: '1rem' }}>
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </div>

      {(isAnySectionDirty() && !isAnyPassInvalid) && (
        <button
          onClick={(e) => handleSave(e, 'All changes')}
          disabled={savingSection !== null || isUploadingMain}
          style={{
            position: 'fixed',
            bottom: '80px',
            right: '2rem',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '16px 28px',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            color: '#fff',
            backgroundColor: 'var(--success-color)',
            border: 'none',
            borderRadius: '15px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            cursor: 'pointer'
          }}
        >
          <Check size={24} /> Save Now
        </button>
      )}

    </div>
  );
}

export default Profile;
