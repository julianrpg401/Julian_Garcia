document.getElementById('ver-mas').addEventListener('click', function() {
    let moreInfo = document.getElementById('mas-informacion');
    let button = document.getElementById('ver-mas');
    
    if (moreInfo.classList.contains('mas__informacion')) {
        moreInfo.classList.remove('mas__informacion');
        button.textContent = 'VER MENOS';
    } else {
        moreInfo.classList.add('mas__informacion');
        button.textContent = 'VER MÁS';
    }
});