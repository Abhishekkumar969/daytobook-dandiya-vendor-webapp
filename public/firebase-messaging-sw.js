importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyBNaYI4Tx1KGSTclInbQC8y9W5Auyp7row",
  authDomain: "daytobook-11f1d.firebaseapp.com",
  projectId: "daytobook-11f1d",
  storageBucket: "daytobook-11f1d.firebasestorage.app",
  messagingSenderId: "260292441274",
  appId: "1:260292441274:web:19e1eaa9cfe7e30d5dfe83"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw.js] Received background message: ", payload);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  let urlToOpen = "/records";
  if (event.notification.data && event.notification.data.url) {
    urlToOpen = event.notification.data.url;
  } else if (event.notification.data && event.notification.data.FCM_MSG && event.notification.data.FCM_MSG.data && event.notification.data.FCM_MSG.data.link) {
    urlToOpen = event.notification.data.FCM_MSG.data.link;
  } else if (event.notification.data && event.notification.data.link) {
    urlToOpen = event.notification.data.link;
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ("focus" in client) {
          if ("navigate" in client) {
            client.navigate(urlToOpen);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
