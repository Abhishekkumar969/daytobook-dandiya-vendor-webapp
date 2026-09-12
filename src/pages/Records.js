import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { CheckCircle, Clock } from 'lucide-react';

function Records({ user }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cleanEmail = user.email.toLowerCase().trim();
    const rootCollectionName = `${cleanEmail}_ticket`;

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

    return () => unsubscribe();
  }, [user]);

  if (loading) {
    return <div className="loading-screen">Loading Records...</div>;
  }

  // Calculate stats
  const totalRevenue = records.reduce((acc, r) => acc + (Number(r.totalAmount) || 0), 0);
  const totalTickets = records.reduce((acc, r) => {
    if (r.passes && Array.isArray(r.passes)) {
      return acc + r.passes.reduce((passAcc, p) => passAcc + (Number(p.quantity) || 0), 0);
    }
    return acc + 1;
  }, 0);
  const totalVisited = records.filter(r => r.visited || (r.visits && r.visits.visited)).length;

  return (
    <div className="records-container">
      <div className="records-header">
        <h2>Dashboard Overview</h2>
        <p>Real-time analytics for your event</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h4>Total Revenue</h4>
          <p>₹{totalRevenue}</p>
        </div>
        <div className="stat-card">
          <h4>Tickets Sold</h4>
          <p>{totalTickets}</p>
        </div>
        <div className="stat-card">
          <h4>Checked In</h4>
          <p>{totalVisited}</p>
        </div>
      </div>

      <h3>Recent Bookings</h3>
      <div className="records-list" style={{ marginTop: '1rem' }}>
        {records.length === 0 ? (
          <p>No bookings found.</p>
        ) : (
          records.map((record) => (
            <div key={record.id} className="record-item">
              <div className="record-info">
                <h4>{record.customerName || `${record.firstName || ''} ${record.lastName || ''}`.trim() || 'Unknown Customer'}</h4>
                <p>{record.customerPhone || record.phone || 'No Phone'} • ₹{record.totalAmount}</p>
                <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                  {record.passes && record.passes.map(p => `${p.quantity}x ${p.name}`).join(', ')}
                </p>
              </div>
              <div className="record-status">
                {(record.visited || (record.visits && record.visits.visited)) ? (
                  <span className="status-badge visited">
                    <CheckCircle size={12} style={{ display: 'inline', marginRight: '4px' }}/>
                    Visited
                  </span>
                ) : (
                  <span className="status-badge pending">
                    <Clock size={12} style={{ display: 'inline', marginRight: '4px' }}/>
                    Pending
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Records;
