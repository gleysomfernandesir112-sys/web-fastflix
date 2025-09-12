import { auth, onAuthStateChanged, db, ref, get, set, update } from './firebase-init.js';
import { updatePassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

async function getIconFiles() {
    try {
        const response = await fetch('images/PROFILE_ICONS/icons.json');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch icon list:', error);
        return ["Default.png"];
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const iconGrid = document.getElementById('icon-selection-grid');
    const profileMessage = document.getElementById('profile-message');
    const passwordForm = document.getElementById('change-password-form');
    const passwordMessage = document.getElementById('password-message');
    const currentIconWrapper = document.getElementById('current-profile-icon');
    const currentIconImg = document.getElementById('current-icon-img');
    const iconModal = document.getElementById('icon-modal');
    const saveProfileBtn = document.getElementById('save-profile-btn');
    const confirmIconBtn = document.getElementById('confirm-icon-btn');
    const cancelIconBtn = document.getElementById('cancel-icon-btn');
    const usernameInput = document.getElementById('username-input');
    const accountStatusSpan = document.getElementById('account-status');
    const accountExpirationSpan = document.getElementById('account-expiration');

    // --- State ---
    let currentUser = null;
    let originalIconName = 'Default.png';
    let selectedIconName = 'Default.png';
    let tempSelectedIconName = 'Default.png';

    // --- Functions ---

    // Populate the icon selection grid in the modal
    async function populateIconGrid() {
        if (!iconGrid) return;
        iconGrid.innerHTML = '';
        const iconFiles = await getIconFiles();

        iconFiles.sort().forEach(fileName => {
            const div = document.createElement('div');
            div.className = 'icon-item';
            div.dataset.fileName = fileName;

            const img = new Image();
            img.alt = `Ícone ${fileName}`;
            img.src = `images/PROFILE_ICONS/${fileName}`;
            
            img.onload = () => {
                div.appendChild(img);
                iconGrid.appendChild(div);
                 // Pre-select the icon that is currently active
                if (fileName === selectedIconName) {
                    div.classList.add('selected');
                    tempSelectedIconName = selectedIconName;
                }
            };

            div.addEventListener('click', () => {
                document.querySelectorAll('#icon-selection-grid .icon-item.selected').forEach(el => el.classList.remove('selected'));
                div.classList.add('selected');
                tempSelectedIconName = fileName;
            });
        });
    }

    // Open the icon selection modal
    function openIconModal() {
        tempSelectedIconName = selectedIconName; // Reset temp selection
        const currentSelected = iconGrid.querySelector(`.icon-item[data-file-name="${selectedIconName}"]`);
        if(currentSelected) {
            document.querySelectorAll('#icon-selection-grid .icon-item.selected').forEach(el => el.classList.remove('selected'));
            currentSelected.classList.add('selected');
        }
        iconModal.style.display = 'block';
    }

    // Close the icon selection modal
    function closeIconModal() {
        iconModal.style.display = 'none';
    }

    // Update user profile data in Firebase
    async function saveProfile() {
        if (!currentUser) {
            profileMessage.textContent = 'Usuário não encontrado.';
            profileMessage.className = 'text-red-400';
            return;
        }

        if (originalIconName === selectedIconName) {
            profileMessage.textContent = 'Nenhuma alteração para salvar.';
            profileMessage.className = 'text-gray-400';
            setTimeout(() => profileMessage.textContent = '', 3000);
            return;
        }

        const userRef = ref(db, `users/${currentUser.uid}`);
        try {
            await update(userRef, {
                profileIcon: selectedIconName
            });
            originalIconName = selectedIconName; // Update original name after successful save
            profileMessage.textContent = 'Perfil salvo com sucesso!';
            profileMessage.className = 'text-green-400';
        } catch (error) {
            console.error("Erro ao salvar o perfil:", error);
            profileMessage.textContent = 'Erro ao salvar o perfil.';
            profileMessage.className = 'text-red-400';
        } finally {
            setTimeout(() => profileMessage.textContent = '', 3000);
        }
    }

    // --- Event Listeners ---

    // Open modal when clicking the profile icon
    currentIconWrapper.addEventListener('click', openIconModal);

    // Modal buttons
    confirmIconBtn.addEventListener('click', () => {
        selectedIconName = tempSelectedIconName;
        currentIconImg.src = `images/PROFILE_ICONS/${selectedIconName}`;
        closeIconModal();
    });
    cancelIconBtn.addEventListener('click', closeIconModal);

    // Main action buttons
    saveProfileBtn.addEventListener('click', saveProfile);

    // --- Initialization ---

    // Watch for auth state changes and load user data
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            const userRef = ref(db, 'users/' + user.uid);
            const snapshot = await get(userRef);

            if (snapshot.exists()) {
                const userData = snapshot.val();
                
                // Set username (email as fallback)
                usernameInput.value = userData.username || user.email;

                // Set account status and expiration
                accountStatusSpan.textContent = userData.status === 'active' ? 'Ativa' : 'Bloqueada';
                if (userData.expirationDate) {
                    accountExpirationSpan.textContent = new Date(userData.expirationDate).toLocaleDateString();
                } else {
                    accountExpirationSpan.textContent = 'N/A';
                }

                // Set profile icon
                originalIconName = userData.profileIcon || 'Default.png';
                selectedIconName = originalIconName;
                currentIconImg.src = `images/PROFILE_ICONS/${selectedIconName}`;

                // Populate the icon grid now that we have the user's current icon
                populateIconGrid();

            } else {
                 // Handle case where user exists in Auth but not in DB
                profileMessage.textContent = 'Dados do perfil não encontrados.';
            }
        } else {
            window.location.href = 'login.html';
        }
    });

    // Handle password change form
    passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        passwordMessage.textContent = '';
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (newPassword.length < 6) {
            passwordMessage.textContent = 'A nova senha deve ter pelo menos 6 caracteres.';
            passwordMessage.className = 'text-red-400 text-center mt-2';
            return;
        }
        if (newPassword !== confirmPassword) {
            passwordMessage.textContent = 'As senhas não coincidem.';
            passwordMessage.className = 'text-red-400 text-center mt-2';
            return;
        }

        try {
            await updatePassword(currentUser, newPassword);
            passwordMessage.textContent = 'Senha alterada com sucesso!';
            passwordMessage.className = 'text-green-400 text-center mt-2';
            passwordForm.reset();
        } catch (error) {
            console.error("Erro ao alterar a senha:", error);
            passwordMessage.textContent = 'Erro ao alterar a senha. Pode ser necessário fazer login novamente.';
            passwordMessage.className = 'text-red-400 text-center mt-2';
        } finally {
            setTimeout(() => passwordMessage.textContent = '', 3000);
        }
    });
});