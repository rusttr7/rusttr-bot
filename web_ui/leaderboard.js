async function fetchLeaderboard() {
    try {
        const res = await fetch('/api/leaderboard');
        const json = await res.json();
        if (json.success && json.data) {
            updateUI(json.data);
        }
    } catch (e) {
        console.error("Leaderboard verisi alınamadı", e);
    }
}

function updateUI(data) {
    const players = Object.values(data);
    if (players.length === 0) return;

    // Remove loading classes
    document.querySelectorAll('.loading').forEach(el => el.classList.remove('loading'));

    const topKills = [...players].sort((a,b) => (b.Kills||0) - (a.Kills||0)).slice(0, 5);
    const topWood = [...players].sort((a,b) => (b.WoodGathered||0) - (a.WoodGathered||0)).slice(0, 5);
    const topStone = [...players].sort((a,b) => (b.StoneGathered||0) - (a.StoneGathered||0)).slice(0, 5);
    const topBarrels = [...players].sort((a,b) => (b.BarrelsBroken||0) - (a.BarrelsBroken||0)).slice(0, 5);
    const longestKill = [...players].sort((a,b) => (b.LongestKillDistance||0) - (a.LongestKillDistance||0))[0];

    populateList('list-kills', topKills, 'Kills', 'Leş');
    populateList('list-wood', topWood, 'WoodGathered', 'Odun');
    populateList('list-stone', topStone, 'StoneGathered', 'Taş');
    populateList('list-barrels', topBarrels, 'BarrelsBroken', 'Kutu');

    const longestBox = document.getElementById('longest-kill-box');
    if (longestKill && longestKill.LongestKillDistance > 0) {
        longestBox.innerHTML = `
            <span class="player-name">${longestKill.Name}</span>
            <span class="kill-dist">${longestKill.LongestKillDistance}m</span>
        `;
    }
}

function populateList(elementId, players, statKey, unit) {
    const ul = document.getElementById(elementId);
    if (!ul) return;
    
    ul.innerHTML = '';
    if (players.length === 0 || (players[0] && !players[0][statKey])) {
        ul.innerHTML = '<li>Veri yok</li>';
        return;
    }

    players.forEach((p, index) => {
        if (!p[statKey]) return; // Stat yoksa gösterme
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="rank">#${index + 1}</div>
            <div class="name">${p.Name}</div>
            <div class="score">${p[statKey]} <span>${unit}</span></div>
        `;
        ul.appendChild(li);
    });
}

// 5 saniyede bir güncelle
setInterval(fetchLeaderboard, 5000);
fetchLeaderboard();
