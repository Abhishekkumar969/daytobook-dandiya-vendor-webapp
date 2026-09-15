import { messaging, db, firebase } from '../firebase';

let isForegroundAttached = false;

// Setup foreground listener so active tab can show notification popup
export const setupForegroundListener = (onReceive) => {
  if (!messaging || isForegroundAttached) return;

  try {
    messaging.onMessage((payload) => {
      console.log('[Foreground notification received]:', payload);
      
      const title = payload.notification?.title || payload.data?.title || 'New Notification';
      const body = payload.notification?.body || payload.data?.body || '';
      const icon = payload.webpush?.notification?.icon || payload.data?.icon || 'https://res.cloudinary.com/do7z8byh3/image/upload/v1789470834/Daytobook_2_dtofoh.png';

      if (Notification.permission === 'granted') {
        if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(title, {
              body,
              icon,
              data: payload.data || {}
            });
          }).catch(() => {
            new Notification(title, { body, icon });
          });
        } else {
          new Notification(title, { body, icon });
        }
      }

      if (typeof onReceive === 'function') {
        onReceive(payload);
      }
    });

    isForegroundAttached = true;
  } catch (e) {
    console.warn('Foreground message listener error:', e);
  }
};

// Request Notification permission and save FCM token to Organizer's Firestore doc
export const requestAndSaveOrganizerToken = async (organizerEmail, onReceiveNotification = null) => {
  if (!organizerEmail || typeof window === 'undefined' || !('Notification' in window) || !messaging) {
    return null;
  }

  try {
    const cleanEmail = organizerEmail.toLowerCase().trim();
    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
      const token = await messaging.getToken();

      if (token) {
        console.log('Organizer FCM Token generated:', token);

        // Find and update organizer document in EventTicketRegistration
        const snap = await db.collection('EventTicketRegistration')
          .where('email', '==', cleanEmail)
          .get();

        if (!snap.empty) {
          const promises = snap.docs.map(doc => {
            return doc.ref.update({
              fcmTokens: firebase.firestore.FieldValue.arrayUnion(token),
              fcmToken: token,
              lastTokenRefresh: firebase.firestore.FieldValue.serverTimestamp()
            });
          });
          await Promise.all(promises);
          console.log(`Saved FCM token to ${snap.docs.length} EventTicketRegistration document(s) for ${cleanEmail}`);
        }

        // Attach foreground listener
        setupForegroundListener(onReceiveNotification);
        return token;
      }
    } else {
      console.log('Notification permission denied by organizer.');
    }
  } catch (err) {
    console.warn('Error obtaining organizer FCM token:', err);
  }
  return null;
};

// Subscribe to real-time notifications for the organizer
export const subscribeToOrganizerNotifications = (organizerEmail, callback) => {
  if (!organizerEmail) return () => {};

  const cleanEmail = organizerEmail.toLowerCase().trim();
  return db.collection(`${cleanEmail}_notifications`)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .onSnapshot((snapshot) => {
      const list = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      callback(list);
    }, (error) => {
      console.warn('Error listening to organizer notifications:', error);
    });
};
