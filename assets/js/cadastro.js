// Seleciona os elementos usados na confirmação da solicitação.
const registrationForm = document.querySelector('#registration-form');
const confirmationModal = document.querySelector('#confirmation-modal');
const closeModalButton = document.querySelector('#close-modal');

// Guarda o elemento que estava ativo para devolver o foco ao fechar o modal.
let previousFocusedElement = null;

// Abre a confirmação somente depois que o navegador valida todos os campos.
registrationForm.addEventListener('submit', (event) => {
    // Impede o envio real enquanto o formulário ainda não está conectado ao backend.
    event.preventDefault();

    previousFocusedElement = document.activeElement;
    confirmationModal.hidden = false;
    closeModalButton.focus();
});

// Função única para fechar o modal e restaurar o foco do usuário.
function closeConfirmationModal() {
    confirmationModal.hidden = true;

    if (previousFocusedElement) {
        previousFocusedElement.focus();
    }
}

// Fecha pelo botão com o símbolo de X.
closeModalButton.addEventListener('click', closeConfirmationModal);

// Também fecha quando o usuário clica na área escura fora do cartão.
confirmationModal.addEventListener('click', (event) => {
    if (event.target === confirmationModal) {
        closeConfirmationModal();
    }
});

// Permite fechar usando a tecla Escape, melhorando a acessibilidade.
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !confirmationModal.hidden) {
        closeConfirmationModal();
    }
});
