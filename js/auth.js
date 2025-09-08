import { auth, onAuthStateChanged, signInWithEmailAndPassword, signOut, db, ref, get, set, setPersistence, browserSessionPersistence, browserLocalPersistence, onValue } from './firebase-init.js';

// Função para atualizar a seção de perfil do usuário em tempo real
function updateProfileSection(user) {
    if (!user) {
        console.warn('Nenhum usuário fornecido para updateProfileSection');
        return;
    }

    const profileIconDisplay = document.getElementById('profile-icon-display');
    const userNameDisplay = document.getElementById('user-name');
    
    if (!profileIconDisplay || !userNameDisplay) {
        console.warn('Elementos profile-icon-display ou user-name não encontrados');
        return;
    }

    const userRef = ref(db, 'users/' + user.uid);

    // Usar onValue para escutar mudanças em tempo real
    onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
            const userData = snapshot.val();
            profileIconDisplay.src = `/images/PROFILE_ICONS/${userData.profileIcon || 'Default.png'}`;
            userNameDisplay.textContent = (userData.name || user.email).split('@')[0];

            // Lógica para o link de admin
            const adminLink = document.getElementById('admin-link');
            if (userData.role === 'admin' && !adminLink) {
                const navLinks = document.querySelector('.nav-links');
                if (navLinks) {
                    const newAdminLink = document.createElement('a');
                    newAdminLink.id = 'admin-link';
                    newAdminLink.href = 'admin.html';
                    newAdminLink.textContent = 'Admin';
                    navLinks.appendChild(newAdminLink);
                }
            } else if (userData.role !== 'admin' && adminLink) {
                adminLink.remove();
            }

        } else {
            // Se o usuário não existir no banco de dados, cria um registro padrão
            const userName = user.email.split('@')[0];
            const role = userName === 'admin' ? 'admin' : 'user';
            const expiration = new Date();
            expiration.setDate(expiration.getDate() + 30);
            set(userRef, { 
                profileIcon: 'Default.png', 
                name: userName, 
                role,
                status: 'ativo',
                expirationDate: expiration.toISOString()
            }).then(() => {
                console.log('Novo documento de usuário criado com valores padrão.');
            });
        }
    }, (error) => {
        console.error('Erro ao obter documento do usuário:', error);
        profileIconDisplay.src = '/images/PROFILE_ICONS/Default.png';
        userNameDisplay.textContent = user.email.split('@')[0];
    });
}

// Função para gerenciar a página de login
function handleLoginPage() {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    const rememberMeCheckbox = document.getElementById('remember-me');

    if (!loginForm || !errorMessage || !rememberMeCheckbox) {
        console.warn('Elementos do formulário de login não encontrados');
        return;
    }

    // Verificar estado de autenticação
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log('Usuário já autenticado, redirecionando para index.html');
            window.location.href = 'index.html';
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.textContent = '';

        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');

        if (!usernameInput || !passwordInput) {
            errorMessage.textContent = 'Campos de usuário ou senha não encontrados.';
            return;
        }

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            errorMessage.textContent = 'Por favor, preencha usuário e senha.';
            return;
        }

        const email = `${username}@fasthub.cloud`;

        try {
            const persistence = rememberMeCheckbox.checked ? browserLocalPersistence : browserSessionPersistence;
            await setPersistence(auth, persistence);
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log('Login bem-sucedido:', userCredential.user);
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Erro de login:', error);
            switch (error.code) {
                case 'auth/invalid-email':
                    errorMessage.textContent = 'O formato do usuário é inválido.';
                    break;
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                case 'auth/invalid-credential':
                    errorMessage.textContent = 'Usuário ou senha incorretos.';
                    break;
                case 'auth/too-many-requests':
                    errorMessage.textContent = 'Muitas tentativas de login. Tente novamente mais tarde.';
                    break;
                default:
                    errorMessage.textContent = `Erro ao fazer login: ${error.message}`;
                    break;
            }
        }
    });
}

// Função para gerenciar páginas protegidas
function handleProtectedPage() {
    try {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const userRef = ref(db, 'users/' + user.uid);
                    const snapshot = await get(userRef);
                    if (snapshot.exists()) {
                        const userData = snapshot.val();
                        if (window.location.pathname.endsWith('admin.html') && userData.role !== 'admin') {
                            console.log('Usuário não é admin, redirecionando para index.html');
                            window.location.href = 'index.html';
                        } else {
                            await updateProfileSection(user);
                        }
                    } else {
                        if (window.location.pathname.endsWith('admin.html')) {
                            console.log('Dados do usuário não encontrados, redirecionando para index.html');
                            window.location.href = 'index.html';
                        } else {
                            await updateProfileSection(user);
                        }
                    }
                } catch (error) {
                    console.error('Erro ao verificar dados do usuário:', error);
                    window.location.href = 'login.html';
                }
            } else {
                console.log('Nenhum usuário autenticado, redirecionando para login.html');
                window.location.href = 'login.html';
            }
        });
    } catch (error) {
        console.error('Erro em onAuthStateChanged:', error);
        window.location.href = 'login.html';
    }

    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await signOut(auth);
                localStorage.clear(); // Limpa o localStorage para garantir um logout completo
                console.log('Usuário desconectado.');
                window.location.href = 'login.html';
            } catch (error) {
                console.error('Erro ao desconectar:', error);
                alert('Erro ao sair. Tente novamente.');
            }
        });
    }
}

// Função para controlar o dropdown
window.toggleDropdown = function() {
    const dropdown = document.querySelector('.profile-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

// Fecha o dropdown se clicar fora dele
window.addEventListener('click', function(event) {
    const dropdown = document.querySelector('.profile-dropdown');
    if (dropdown && !dropdown.contains(event.target)) {
        dropdown.classList.remove('active');
    }
});

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    console.log('Página atual:', currentPage);

    if (currentPage === 'login.html') {
        console.log('Gerenciando página de login');
        handleLoginPage();
    } else {
        console.log('Gerenciando página protegida');
        handleProtectedPage();
    }
});