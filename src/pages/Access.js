import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { Trash2, UserPlus, ShieldAlert, KeyRound, Mail } from 'lucide-react';
import './Access.css';

function Access({ user, vendorData }) {
  const [email, setEmail] = useState('');
  const [accessPages, setAccessPages] = useState({
    scan: true,
    records: false,
    access: false,
    profile: false
  });

  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const orgEmail = vendorData.email.toLowerCase().trim();
    const unsubscribe = db.collection("EventTicketRegistration")
      .where("email", "==", orgEmail)
      .onSnapshot((snapshot) => {
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const data = doc.data();
          setStaffList(data.access || []);
        }
        setLoading(false);
      }, (err) => {
        console.error("Error fetching staff:", err);
        setError("Failed to load staff list.");
        setLoading(false);
      });

    return () => unsubscribe();
  }, [vendorData.email]);

  const handleCheckboxChange = (page) => {
    setAccessPages(prev => ({
      ...prev,
      [page]: !prev[page]
    }));
  };

  const handleAddStaff = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    const staffEmail = email.toLowerCase().trim();
    if (!staffEmail) {
      setError("Please provide a valid email.");
      setSubmitting(false);
      return;
    }

    const adminEmail = (vendorData?.email || user?.email || '').trim().toLowerCase();
    if (staffEmail === adminEmail) {
      setError("Cannot applicable on organizer mail. Organizer already has full access.");
      setSubmitting(false);
      return;
    }

    const selectedPages = Object.keys(accessPages).filter(key => accessPages[key]);
    if (selectedPages.length === 0) {
      setError("Please select at least one page for access.");
      setSubmitting(false);
      return;
    }

    try {
      const orgEmail = vendorData.email.toLowerCase().trim();

      // 1. Get the organizer's document reference
      const snapshot = await db.collection("EventTicketRegistration")
        .where("email", "==", orgEmail)
        .get();

      if (snapshot.empty) throw new Error("Organizer document not found.");
      const orgDoc = snapshot.docs[0];

      // Check if staff already exists
      const currentAccess = orgDoc.data().access || [];
      if (currentAccess.find(s => s.email === staffEmail)) {
        throw new Error("This email is already added as staff.");
      }

      // 2. Update Firestore Document
      const newStaff = {
        email: staffEmail,
        pages: selectedPages,
        createdAt: new Date().toISOString()
      };

      const newAccessList = [...currentAccess, newStaff];
      const newAccessEmails = (orgDoc.data().accessEmails || []);
      if (!newAccessEmails.includes(staffEmail)) {
        newAccessEmails.push(staffEmail);
      }

      await db.collection("EventTicketRegistration").doc(orgDoc.id).update({
        access: newAccessList,
        accessEmails: newAccessEmails
      });

      // 4. Success cleanup
      setSuccess(`Successfully granted access to ${staffEmail}`);
      setEmail('');
      setAccessPages({ scan: true, records: false, access: false, profile: false });

    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to create staff account.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeAccess = async (staffEmail) => {
    if (!window.confirm(`Are you sure you want to revoke access for ${staffEmail}?`)) return;

    setError('');
    try {
      const orgEmail = vendorData.email.toLowerCase().trim();
      const snapshot = await db.collection("EventTicketRegistration")
        .where("email", "==", orgEmail)
        .get();

      if (snapshot.empty) throw new Error("Organizer document not found.");
      const orgDoc = snapshot.docs[0];

      const currentAccess = orgDoc.data().access || [];
      const currentAccessEmails = orgDoc.data().accessEmails || [];

      const newAccess = currentAccess.filter(s => s.email !== staffEmail);
      const newAccessEmails = currentAccessEmails.filter(e => e !== staffEmail);

      await db.collection("EventTicketRegistration").doc(orgDoc.id).update({
        access: newAccess,
        accessEmails: newAccessEmails
      });

      setSuccess(`Access revoked for ${staffEmail}`);
      setStaffList(newAccess);
    } catch (err) {
      console.error(err);
      setError("Failed to revoke access.");
    }
  };

  const handleTogglePermission = async (staffEmail, pageName) => {
    try {
      const orgEmail = vendorData.email.toLowerCase().trim();
      const snapshot = await db.collection("EventTicketRegistration")
        .where("email", "==", orgEmail)
        .get();

      if (snapshot.empty) return;
      const orgDoc = snapshot.docs[0];

      const currentAccess = orgDoc.data().access || [];
      const staffIndex = currentAccess.findIndex(s => s.email === staffEmail);

      if (staffIndex === -1) return;

      let staffPages = currentAccess[staffIndex].pages || [];
      if (staffPages.includes(pageName)) {
        staffPages = staffPages.filter(p => p !== pageName);
      } else {
        staffPages = [...staffPages, pageName];
      }

      currentAccess[staffIndex].pages = staffPages;

      await db.collection("EventTicketRegistration").doc(orgDoc.id).update({
        access: currentAccess
      });

      setStaffList(currentAccess);
    } catch (err) {
      console.error(err);
      alert("Failed to update permission.");
    }
  };

  const adminEmail = (vendorData?.email || user?.email || '').trim().toLowerCase();
  const isAdminEmail = email.trim().toLowerCase() === adminEmail && email.trim() !== '';
  const isAlreadyStaff = email.trim() !== '' && staffList.some(s => s.email.toLowerCase() === email.trim().toLowerCase());

  const ALL_PAGES = ['scan', 'records', 'profile', 'access'];
  const PAGE_LABELS = {
    scan: 'Scan Tickets',
    records: 'Ticket Records',
    profile: 'Event Profile',
    access: 'Access Management'
  };



  return (
    <div className="access-container">
      <div className="access-header" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0 }}><ShieldAlert size={24} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} /> Access Management</h2>
            <p style={{ margin: '0.2rem 0 0 0' }}>Manage sub-users and their permissions</p>
          </div>

        </div>
      </div>


      <div className="access-card">
        <h3><UserPlus size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} /> Add Staff Member</h3>
        <form onSubmit={handleAddStaff} autoComplete="off">
          {/* Dummy hidden fields to trick browser autofill */}
          <input type="text" name="fakeusernameremembered" style={{ display: 'none' }} />
          <input type="password" name="fakepasswordremembered" style={{ display: 'none' }} />

          <div className="form-group">
            <label>Email Address</label>
            <div className="input-with-icon">
              <Mail size={18} />
              <input
                type="email"
                name="staff_email_new"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staffemail@example.com"
                required
                autoComplete="off"
              />
            </div>
            {isAdminEmail && (
              <p style={{ color: 'var(--error-color)', fontSize: '0.8rem', marginTop: '4px' }}>
                Cannot applicable on organizer mail.
              </p>
            )}
            {isAlreadyStaff && (
              <p style={{ color: 'var(--warning-color)', fontSize: '0.8rem', marginTop: '4px' }}>
                Already in current staff.
              </p>
            )}
          </div>



          <div className="permissions-group">
            <label>Assign Permissions</label>
            <div className="staff-tags" style={{ marginTop: '8px' }}>
              {ALL_PAGES.map(page => {
                const hasAccess = accessPages[page];
                return (
                  <button
                    key={page}
                    type="button"
                    onClick={() => handleCheckboxChange(page)}
                    className={`tag-toggle ${hasAccess ? 'active' : 'inactive'}`}
                  >
                    {PAGE_LABELS[page]}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            className="primary-btn"
            disabled={
              submitting ||
              isAdminEmail ||
              isAlreadyStaff ||
              !email.trim() ||
              !Object.values(accessPages).some(val => val)
            }
            style={{
              backgroundColor: (!email.trim() || !Object.values(accessPages).some(val => val) || isAdminEmail || isAlreadyStaff) ? 'var(--bg-surface-light)' : 'var(--primary-color)',
              color: (!email.trim() || !Object.values(accessPages).some(val => val) || isAdminEmail || isAlreadyStaff) ? 'var(--text-secondary)' : 'var(--text-primary)',
              cursor: (!email.trim() || !Object.values(accessPages).some(val => val) || isAdminEmail || isAlreadyStaff) ? 'not-allowed' : 'pointer',
              marginTop: '15px'
            }}
          >
            {submitting ? 'Granting Access...' : 'Grant Permission'}
          </button>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}
        </form>
      </div>

      <div className="access-card">
        <h3><KeyRound size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} /> Current Staff</h3>
        {loading ? (
          <p>Loading...</p>
        ) : staffList.length === 0 ? (
          <p className="no-data">No staff members have been added yet.</p>
        ) : (
          <div className="staff-list">
            {staffList.map((staff, index) => (
              <div key={index} className="staff-item">
                <div className="staff-info">
                  <strong>{staff.email}</strong>
                  <div className="staff-tags">
                    {ALL_PAGES.map(page => {
                      const hasAccess = staff.pages.includes(page);
                      return (
                        <button
                          key={page}
                          onClick={() => handleTogglePermission(staff.email, page)}
                          className={`tag-toggle ${hasAccess ? 'active' : 'inactive'}`}
                        >
                          {PAGE_LABELS[page]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {staff.email !== user?.email && (
                  <button
                    onClick={() => handleRevokeAccess(staff.email)}
                    className="icon-btn delete-btn"
                    title="Revoke Access"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

export default Access;
