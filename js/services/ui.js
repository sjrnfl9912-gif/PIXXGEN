export function toast(message, type = 'info') {
  const container = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3000);
}

export function showLoading(show = true) {
  const overlay = document.getElementById('loadingOverlay');
  if (show) {
    overlay.classList.remove('hide');
  } else {
    overlay.classList.add('hide');
  }
}

export function customConfirm(msg, onOk, onCancel) {
  const bg = document.createElement('div');
  bg.className = 'cfm-bg';
  bg.innerHTML =
    '<div class="cfm"><div class="cfm-msg"></div><div class="cfm-btns"><button class="btn" id="cfmNo">취소</button><button class="btn btn-pr" id="cfmYes">확인</button></div></div>';
  bg.querySelector('.cfm-msg').textContent = msg;
  document.body.appendChild(bg);
  bg.querySelector('#cfmYes').onclick = () => {
    bg.remove();
    if (onOk) onOk();
  };
  bg.querySelector('#cfmNo').onclick = () => {
    bg.remove();
    if (onCancel) onCancel();
  };
  bg.addEventListener('click', (e) => {
    if (e.target === bg) {
      bg.remove();
      if (onCancel) onCancel();
    }
  });
}

export function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

export function getElement(id) {
  return document.getElementById(id);
}

export function getAllElements(selector) {
  return document.querySelectorAll(selector);
}
