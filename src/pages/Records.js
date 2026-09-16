import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { subscribeToOrganizerNotifications } from '../services/notificationService';


function Records({ user, vendorData }) {
  const [records, setRecords] = useState([]);
  const [profilePasses, setProfilePasses] = useState([]);
  const [profileDocId, setProfileDocId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedRecordId, setExpandedRecordId] = useState(null);
  const [toast, setToast] = useState(null); // { message: '', type: 'success' | 'error' }
  const [isLimitsChanged, setIsLimitsChanged] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const cleanEmail = (vendorData?.email || user.email).toLowerCase().trim();
    const rootCollectionName = `${cleanEmail}_ticket`;

    // Fetch vendor profile for passes limits
    db.collection('EventTicketRegistration').where('email', '==', cleanEmail).limit(1).get()
      .then(snap => {
        if (!snap.empty) {
          const doc = snap.docs[0];
          setProfileDocId(doc.id);
          const data = doc.data();
          if (data.passes && Array.isArray(data.passes)) {
            setProfilePasses(data.passes);
          }
        }
      })
      .catch(err => console.error("Error fetching vendor profile passes: ", err));

    const unsubscribe = db.collection(rootCollectionName)
      .orderBy('createdAt', 'desc')
      .onSnapshot((snapshot) => {
        const fetchedRecords = [];
        snapshot.forEach(doc => {
          fetchedRecords.push({ id: doc.id, ...doc.data() });
        });
        setRecords(fetchedRecords);
        setLoading(false);
      }, (err) => {
        console.error("Error fetching records: ", err);
        setLoading(false);
      });

    const unsubscribeNotifs = subscribeToOrganizerNotifications(cleanEmail, (notifs) => {
      if (notifs && notifs.length > 0) {
        const latest = notifs[0];
        // If created in the last 15 seconds, show live toast
        const isRecent = latest.createdAt?.seconds && (Date.now() / 1000 - latest.createdAt.seconds < 15);
        if (isRecent) {
          showToast(latest.title || latest.body, latest.type === 'pass_limit_alert' ? 'error' : 'success');
        }
      }
    });

    return () => {
      unsubscribe();
      unsubscribeNotifs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, vendorData?.email]);

  if (loading) {
    return <div className="loading-screen">Loading Records...</div>;
  }

  // Calculate stats
  const rawTotalRevenue = records.reduce((acc, r) => {
    const passTotal = r.subtotal || (r.passes ? r.passes.reduce((passAcc, p) => passAcc + ((Number(String(p.price).replace(/[^0-9.-]+/g, "")) || 0) * (Number(p.quantity) || 1)), 0) : 0);
    return acc + (Number(passTotal) || Number(r.totalAmount) || 0);
  }, 0);

  // Deduct 5% commission and 18% GST on the commission
  const commission = rawTotalRevenue * 0.05;
  const gst = commission * 0.18;
  const totalRevenue = (rawTotalRevenue - commission - gst).toFixed(2);
  const totalTickets = records.reduce((acc, r) => {
    if (r.passes && Array.isArray(r.passes)) {
      return acc + r.passes.reduce((passAcc, p) => passAcc + (Number(p.quantity) || 0), 0);
    }
    return acc + 1;
  }, 0);

  const totalVisited = records.reduce((acc, r) => {
    if (r.visited || (r.visits && r.visits.visited)) {
      if (r.passes && Array.isArray(r.passes)) {
        return acc + r.passes.reduce((passAcc, p) => passAcc + (Number(p.quantity) || 0), 0);
      }
      return acc + 1;
    }
    return acc;
  }, 0);

  // Calculate sold counts for passes
  const soldCounts = {};
  records.forEach(r => {
    if (r.passes && Array.isArray(r.passes)) {
      r.passes.forEach(p => {
        const id = p.passId || p.name;
        if (id) {
          soldCounts[id] = (soldCounts[id] || 0) + (Number(p.quantity) || 1);
        }
      });
    }
  });

  const handleLimitChange = (index, value) => {
    const updatedPasses = [...profilePasses];
    updatedPasses[index].limit = value;
    setProfilePasses(updatedPasses);
    setIsLimitsChanged(true);
  };

  const saveLimits = async () => {
    if (!profileDocId) return;
    try {
      await db.collection('EventTicketRegistration').doc(profileDocId).update({
        passes: profilePasses
      });
      showToast('Pass limits updated successfully!', 'success');
      setIsLimitsChanged(false);
    } catch (e) {
      console.error(e);
      showToast('Failed to update pass limits.', 'error');
    }
  };



  return (
    <div className="records-container">
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: toast.type === 'success' ? 'rgba(40, 167, 69, 0.95)' : 'rgba(220, 53, 69, 0.95)',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: '500',
          backdropFilter: 'blur(5px)',
          animation: 'slideIn 0.3s ease-out'
        }}>
          {toast.type === 'success' ? <CheckCircle size={18} /> : null}
          {toast.message}
        </div>
      )}

      <div className="records-header" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0 }}>Dashboard Overview</h2>
            <p style={{ margin: '0.2rem 0 0 0' }}>Real-time analytics for your event</p>
          </div>

        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h4>Total Revenue (After Fees)</h4>
          <p>₹{totalRevenue}</p>
        </div>
        <div className="stat-card">
          <h4>Checked In</h4>
          <p>{totalVisited} / {totalTickets}</p>
        </div>
      </div>

      <p style={{ color: 'gray', fontSize: '0.85rem', margin: '0.5rem 0 1rem 0', textAlign: 'center' }}>
        * Total Revenue (After Fees) is calculated by deducting a 5% commission and 18% GST on that commission from the gross revenue.
      </p>

      {/* Pass Limits & Sales (Moved above Recent Bookings) */}
      {profilePasses.length > 0 && (
        <div style={{ marginBottom: '1.5rem', padding: '0.5rem', borderRadius: '12px', background: 'var(--bg-surface-light)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem' }}>Ticket Sales & Limits</h4>
            {isLimitsChanged && (
              <button onClick={saveLimits} className="primary-btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', width: 'auto' }}>
                Save Limits
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {profilePasses.map((pass, index) => {
              const sold = soldCounts[pass.passId] || soldCounts[pass.name] || 0;
              const hasLimit = pass.limit && String(pass.limit).trim() !== '';
              const limit = hasLimit ? Number(pass.limit) : Infinity;
              const isReached = hasLimit && sold >= limit;
              const remaining = Math.max(0, limit - sold);
              const isLowStock = hasLimit && remaining <= 5 && !isReached;

              return (
                <div key={`alert-${pass.passId || index}`} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                  padding: '0.75rem',
                  background: isReached ? 'rgba(239, 68, 68, 0.12)' : (isLowStock ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-color)'),
                  border: `1px solid ${isReached ? '#ef4444' : (isLowStock ? '#f59e0b' : 'var(--border-color)')}`,
                  borderRadius: '8px'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <strong>{pass.name || 'Unnamed Pass'}</strong>
                      {isLowStock && (
                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: '#f59e0b', color: '#fff', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <AlertTriangle size={12} /> Low Limit ({remaining} left)
                        </span>
                      )}
                      {isReached && (
                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: '#ef4444', color: '#fff', fontWeight: '700' }}>
                          Sold Out
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: isReached ? '#ef4444' : (isLowStock ? '#d97706' : 'var(--text-secondary)'), marginTop: '4px', fontWeight: (isLowStock || isReached) ? '600' : 'normal' }}>
                      {hasLimit ? (isReached ? 'Limit reached! Please increase limit.' : (isLowStock ? `⚠️ Only ${remaining} remaining! Please increase your limit.` : `${remaining} remaining`)) : 'Unlimited'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    <span>Sold: <strong style={{ color: 'var(--text-primary)' }}>{sold}</strong> / Limit:</span>
                    <input
                      type="number"
                      min={sold}
                      value={pass.limit || ''}
                      onChange={(e) => handleLimitChange(index, e.target.value)}
                      placeholder="∞"
                      style={{
                        width: '75px',
                        padding: '0.35rem',
                        border: `1px solid ${isReached ? '#ef4444' : (isLowStock ? '#f59e0b' : 'var(--border-color)')}`,
                        borderRadius: '6px',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontWeight: '600'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <h3>Recent Bookings</h3>
      <div className="records-list" style={{ marginTop: '1rem' }}>
        {records.length === 0 ? (
          <p>No bookings found.</p>
        ) : (
          records.map((record) => (
            <div
              key={record.id}
              className="record-item"
              style={{ display: 'block', cursor: 'pointer' }}
              onClick={() => setExpandedRecordId(expandedRecordId === record.id ? null : record.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="record-info">
                  <h4>{record.customerName || `${record.firstName || ''} ${record.lastName || ''}`.trim() || 'Unknown Customer'}</h4>
                  <p>{record.customerPhone || record.phone || 'No Phone'}</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                    {record.passes && record.passes.map(p => `${p.quantity}x ${p.name}${p.price ? ` (${String(p.price).includes('₹') ? p.price : `₹${p.price}`})` : ''}`).join(', ')}
                  </p>
                </div>
                <div className="record-status">
                  {(record.visited || (record.visits && record.visits.visited)) ? (
                    <span className="status-badge visited">
                      <CheckCircle size={12} style={{ display: 'inline', marginRight: '4px' }} />
                      Visited
                    </span>
                  ) : (
                    <span className="status-badge pending">
                      <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                      Pending
                    </span>
                  )}
                </div>
              </div>

              {expandedRecordId === record.id && (
                <div className="record-expanded-details" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <div>
                      <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>Email</strong>
                      {record.customerEmail || record.email || 'N/A'}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>Transaction ID</strong>
                      {record.transactionId || record.id || 'N/A'}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>Total Amount (Paid)</strong>
                      ₹{record.subtotal || (record.passes ? record.passes.reduce((acc, p) => acc + ((Number(String(p.price).replace(/[^0-9.-]+/g, "")) || 0) * (Number(p.quantity) || 1)), 0) || record.totalAmount : record.totalAmount)}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>Purchased On</strong>
                      {record.createdAt ? (record.createdAt.toDate ? record.createdAt.toDate().toLocaleString() : new Date(record.createdAt).toLocaleString()) : 'N/A'}
                    </div>
                    {(record.visited || (record.visits && record.visits.visited)) && (
                      <div>
                        <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>Scanned At</strong>
                        {record.visits?.scannedAt ? (record.visits.scannedAt.toDate ? record.visits.scannedAt.toDate().toLocaleString() : new Date(record.visits.scannedAt).toLocaleString()) : (record.scannedAt ? (record.scannedAt.toDate ? record.scannedAt.toDate().toLocaleString() : new Date(record.scannedAt).toLocaleString()) : 'N/A')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Records;
