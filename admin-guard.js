import { auth, onAuthStateChanged, db, ref, get } from './firebase-init.js';

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userRef = ref(db, 'users/' + user.uid);
        try {
            const snapshot = await get(userRef);
            if (snapshot.exists()) {
                const userData = snapshot.val();
                if (userData.role !== 'admin') {
                    window.location.href = 'index.html';
                }
            } else {
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error('Error getting user role:', error);
            window.location.href = 'index.html';
        }
    } else {
        window.location.href = 'login.html';
    }
});