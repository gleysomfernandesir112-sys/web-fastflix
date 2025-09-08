import { auth, onAuthStateChanged, db, ref, get, set } from './firebase-init.js';
import { updatePassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

async function getIconFiles() {
    try {
        const response = await fetch('/images/PROFILE_ICONS/icons.json');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const icons = await response.json();
        return icons;
    } catch (error) {
        console.error('Failed to fetch icon list:', error);
        // Retorna uma lista padrão em caso de erro
        return ["Default.png"];
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const iconGrid = document.getElementById('icon-selection-grid');
    const userNameInput = document.getElementById('user-name-input');
    const saveProfileButton = document.getElementById('save-profile-button');
    const profileMessage = document.getElementById('profile-message');
    const passwordForm = document.getElementById('change-password-form');
    const passwordMessage = document.getElementById('password-message');

    let currentUser = null;
    let selectedIconName = null;

    // Função para carregar e exibir os ícones
    async function populateIconGrid() {
        if (!iconGrid) return;
        
        // Limpa a grade antes de adicionar novos ícones
        iconGrid.innerHTML = '';

        const iconFiles = await getIconFiles(); // Carrega dinamicamente

        iconFiles.sort().forEach(fileName => {
            const div = document.createElement('div');
            div.className = 'icon-item';
            div.dataset.fileName = fileName;

            const img = new Image(); // Usar new Image() para pré-carregar
            img.alt = `Ícone ${fileName}`;
            
            // Quando a imagem carregar, adicione ao DOM
            img.onload = () => {
                div.appendChild(img);
                iconGrid.appendChild(div);
            };
            
            // Define o src para iniciar o carregamento
            img.src = `/images/PROFILE_ICONS/${fileName}`;

            div.addEventListener('click', () => {
                document.querySelectorAll('.icon-item.selected').forEach(el => el.classList.remove('selected'));
                div.classList.add('selected');
                selectedIconName = fileName;
            });
        });
    }

    // Chama a função para popular a grade
    populateIconGrid();

    // Observa o estado de autenticação e carrega os dados do usuário
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            const userRef = ref(db, 'users/' + user.uid);
            const snapshot = await get(userRef);

            if (snapshot.exists()) {
                const userData = snapshot.val();
                
                // Display account status and expiration date
                const accountStatusSpan = document.getElementById('account-status');
                const accountExpirationSpan = document.getElementById('account-expiration');

                if (userData.status) {
                    accountStatusSpan.textContent = userData.status === 'active' ? 'Ativa' : 'Bloqueada';
                } else {
                    accountStatusSpan.textContent = 'N/A';
                }

                if (userData.expirationDate) {
                    const expirationDate = new Date(userData.expirationDate);
                    accountExpirationSpan.textContent = expirationDate.toLocaleDateString();
                } else if (userData.accountType === 'lifetime') {
                    accountExpirationSpan.textContent = 'Vitalícia';
                } else {
                    accountExpirationSpan.textContent = 'N/A';
                }

                const currentIcon = userData.profileIcon || 'Default.png';
                selectedIconName = currentIcon;
                
                // Aguarda um pouco para garantir que os ícones foram renderizados
                setTimeout(() => {
                    const currentIconElement = document.querySelector(`.icon-item[data-file-name="${currentIcon}"]`);
                    if (currentIconElement) {
                        currentIconElement.classList.add('selected');
                    }
                }, 500);

                userNameInput.value = (userData.name || user.email.split('@')[0]);
            }
        } else {
            window.location.href = 'login.html';
        }
    });

    // Salva o novo ícone e nome de usuário
    saveProfileButton.addEventListener('click', async () => {
        if (!currentUser) {
            profileMessage.textContent = 'Usuário não encontrado.';
            profileMessage.className = 'text-red-400 text-center mt-2';
            return;
        }

        const newName = userNameInput.value.trim();
        if (!newName) {
            profileMessage.textContent = 'O nome de usuário não pode estar vazio.';
            profileMessage.className = 'text-red-400 text-center mt-2';
            return;
        }

        const userRef = ref(db, 'users/' + currentUser.uid);
        try {
            const updates = {
                name: newName
            };
            if (selectedIconName) {
                updates.profileIcon = selectedIconName;
            }
            
            await set(userRef, updates, { merge: true });

            profileMessage.textContent = 'Perfil salvo com sucesso!';
            profileMessage.className = 'text-green-400 text-center mt-2';
        } catch (error) {
            console.error("Erro ao atualizar o perfil:", error);
            profileMessage.textContent = 'Erro ao salvar o perfil. Tente novamente.';
            profileMessage.className = 'text-red-400 text-center mt-2';
        }
    });

    // Lida com a alteração de senha
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
            passwordMessage.textContent = 'Erro ao alterar a senha. Pode ser necessário fazer login novamente para continuar.';
            passwordMessage.className = 'text-red-400 text-center mt-2';
        }
    });
});
