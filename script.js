document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selections ---
    const bodyEl = document.body;
    const yearDisplay = document.getElementById('current-year-display');
    const dataCategoryContainer = document.getElementById('data-category');
    const forwardTravelBtn = document.getElementById('forward-travel-btn');
    const backwardTravelBtn = document.getElementById('backward-travel-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const backBtn = document.getElementById('back-btn');
    const forwardBtn = document.getElementById('forward-btn');
    const categoryFilter = document.getElementById('category-filter');
    const journalBtn = document.getElementById('journal-btn');
    const journalModal = document.getElementById('journal-modal');
    const closeJournalBtn = document.getElementById('close-journal');
    const achievementsBtn = document.getElementById('achievements-btn');
    const achievementsModal = document.getElementById('achievements-modal');
    const closeAchievementsBtn = document.getElementById('close-achievements');
    const achievementsList = document.getElementById('achievements-list');
    const achievementToast = document.getElementById('achievement-toast');
    const paradoxModal = document.getElementById('paradox-modal');
    const paradoxMessage = document.getElementById('paradox-message');
    const closeParadoxBtn = document.getElementById('close-paradox');
    const fractureOverlay = document.getElementById('fracture-overlay');
    const collapseOverlay = document.getElementById('collapse-overlay');

    // --- Game State ---
    let allEvents = [];
    let allAchievements = [];
    let unlockedAchievementIds = new Set();
    let journalEntries = [];
    let discoveredEventIds = new Set();
    let manualJumpTimestamps = [];
    let eraStayTimer = null;
    let currentEra = null;
    let currentYear = new Date().getFullYear();
    let manualJumpDebounceTimer = null;
    let isTraveling = false;
    let travelInterval = null;
    const TRAVEL_SPEED_MS = 50; // How fast the years change
    const FRACTURE_THRESHOLD_COUNT = 8; // 8 jumps...
    const ERA_STAY_DURATION_MS = 15000; // 15 seconds
    const FRACTURE_DURATION_S = 2; // How long the UI scramble lasts in seconds
    const FRACTURE_THRESHOLD_TIME_MS = 1000; // ...within 1 second triggers a fracture

    // --- Functions ---

    function initParticles() {
        tsParticles.load("particles-js", {
            fpsLimit: 60,
            interactivity: {
                events: {
                    onHover: {
                        enable: true,
                        mode: "repulse",
                    },
                    resize: true,
                },
                modes: {
                    repulse: {
                        distance: 100,
                        duration: 0.4,
                    },
                },
            },
            particles: {
                color: {
                    value: "#00aaff",
                },
                links: {
                    color: "#00aaff",
                    distance: 150,
                    enable: true,
                    opacity: 0.2,
                    width: 1,
                },
                collisions: {
                    enable: true,
                },
                move: {
                    direction: "none",
                    enable: true,
                    outModes: "out",
                    random: false,
                    speed: 1,
                    straight: false,
                },
                number: { density: { enable: true, area: 800 }, value: 80 },
                opacity: { value: 0.2 },
                size: { value: { min: 1, max: 3 } },
            },
        });
    }

    /**
     * Animate out existing cards, then render a new list of events.
     * @param {Array<Object>} eventsToRender - The array of event objects to display.
     */
    function renderEvents(eventsToRender, onRenderComplete) {
        const existingCards = dataCategoryContainer.querySelectorAll('.event-card');

        const tl = gsap.timeline({
            onComplete: () => {
                // This code runs after the fade-out animation is complete
                dataCategoryContainer.innerHTML = ''; // Clear container
                if (eventsToRender.length === 0) {
                    dataCategoryContainer.innerHTML = `<p class="no-events">No significant events recorded for this year under the current filter.</p>`;
                    return;
                }

                eventsToRender.forEach(event => {
                    const cardHTML = `
                        <article class="event-card" data-category="${event.category}" data-type="${event.type || 'event'}">
                            <h2>${event.title}</h2>
                            <p><strong>Year:</strong> ${event.year}</p>
                            <p>${event.description}</p>
                        </article>
                    `;
                    dataCategoryContainer.insertAdjacentHTML('beforeend', cardHTML);
                });

                // Animate the newly created cards in
                gsap.fromTo('.event-card', 
                    { opacity: 0, y: 20 }, 
                    { opacity: 1, y: 0, stagger: 0.1, duration: 0.5 }
                );

                if (onRenderComplete) {
                    onRenderComplete(eventsToRender);
                }
            }
        });

        // If there are cards, animate them out first. Otherwise, the onComplete runs immediately.
        if (existingCards.length > 0) {
            tl.to(existingCards, { opacity: 0, y: -20, stagger: 0.05, duration: 0.3 });
        }
    }

    /**
     * Filters and displays events that match the currentYear and selected category.
     */
    function displayEventsForCurrentYear() {
        // Get all events for the current year, regardless of category.
        const allEventsThisYear = allEvents.filter(event => event.year === currentYear);

        // Log any first-time discoveries for this year
        allEventsThisYear.forEach(event => {
            if (!discoveredEventIds.has(event.id)) {
                discoveredEventIds.add(event.id);
                localStorage.setItem('discoveredEventIds', JSON.stringify([...discoveredEventIds]));
                addJournalEntry(`Discovered Event: "${event.title}" in ${event.year}.`);
            }
        });

        // Check if a paradox event exists in this year's events.
        const paradoxEvent = allEventsThisYear.find(event => event.type === 'paradox');

        if (paradoxEvent) {
            // If a paradox exists, render ONLY that event and trigger the paradox sequence.
            renderEvents([paradoxEvent], (renderedEvents) => {
                triggerParadox(paradoxEvent);
            });
        } else {
            // If no paradox, proceed with normal filtering.
            const selectedCategory = categoryFilter.value;
            let eventsToDisplay = allEventsThisYear;

            if (selectedCategory !== 'all') {
                eventsToDisplay = eventsToDisplay.filter(event => event.category === selectedCategory);
            }
            
            renderEvents(eventsToDisplay, (renderedEvents) => {
                // Only check for achievements if no paradox occurred
                checkForAchievementUnlocks(renderedEvents);
            });
        }
    }

    function showAchievementToast(achievement) {
        achievementToast.innerHTML = `
            <p class="toast-title"><i class="fas fa-trophy"></i> Achievement Unlocked!</p>
            <p class="toast-description">${achievement.title}</p>
        `;
        achievementToast.classList.remove('hidden');
        achievementToast.classList.add('show');

        // Hide the toast after a few seconds
        setTimeout(() => {
            achievementToast.classList.remove('show');
        }, 4000);
    }

    function unlockAchievement(achievement) {
        if (!unlockedAchievementIds.has(achievement.id)) {
            unlockedAchievementIds.add(achievement.id);
            localStorage.setItem('unlockedAchievements', JSON.stringify([...unlockedAchievementIds]));
            addJournalEntry(`Achievement Unlocked: ${achievement.title}`, 'achievement');
            showAchievementToast(achievement);
            renderAchievementsList(); // Re-render the list to show the unlocked state
        }
    }

    function checkForAchievementUnlocks(displayedEvents) {
        displayedEvents.forEach(event => {
            const achievement = allAchievements.find(ach => ach.eventId === event.id);
            if (achievement) {
                unlockAchievement(achievement);
            }
        });
    }

    function renderAchievementsList() {
        achievementsList.innerHTML = '';
        allAchievements.forEach(ach => {
            const isUnlocked = unlockedAchievementIds.has(ach.id);
            const li = document.createElement('li');
            li.className = isUnlocked ? 'unlocked' : 'locked';
            li.innerHTML = `
                <h3>${ach.title}</h3>
                <p>${isUnlocked ? ach.description : '??????????'}</p>
            `;
            achievementsList.appendChild(li);
        });
    }

    function addJournalEntry(text, type = 'normal') {
        const timestamp = new Date().toLocaleTimeString();
        const entry = { timestamp, text, type };
        journalEntries.unshift(entry); // Add to the beginning of the array
        localStorage.setItem('journalEntries', JSON.stringify(journalEntries)); // <-- SAVING THE DATA
        renderJournal();
    }

    function renderJournal() {
        const journalList = journalModal.querySelector('ul');
        journalList.innerHTML = '';
        journalEntries.forEach(entry => {
            const li = document.createElement('li');
            li.classList.add(`log-${entry.type}`);
            li.innerHTML = `<strong>[${entry.timestamp}]</strong> ${entry.text}`;
            journalList.appendChild(li);
        });
    }

    function triggerParadox(paradox) {
        if (isTraveling) return; // Don't trigger if already in a paradox loop
        isTraveling = true; // Lock controls

        paradoxMessage.textContent = paradox.description;
        paradoxModal.classList.remove('hidden');
        bodyEl.classList.add('screen-shake');
        addJournalEntry(`Paradox Triggered: "${paradox.title}" in ${paradox.year}.`, 'paradox');

        // Sequence the paradox consequences
        setTimeout(() => {
            bodyEl.classList.remove('screen-shake');
        }, 500);

        setTimeout(() => {
            paradoxModal.classList.add('hidden');
            // Consequence: Jump to a random year between 1000 and 2050
            const randomYear = Math.floor(Math.random() * (2050 - 1000 + 1)) + 1000;
            currentYear = randomYear;
            yearDisplay.textContent = currentYear;
            isTraveling = false; // Unlock controls
            displayEventsForCurrentYear();
        }, 4000);
    }

    function getEra(year) {
        // Defines an "era" as a century. e.g., 1955 -> 1900, 1492 -> 1400
        return Math.floor(year / 100) * 100;
    }

    function checkForTimelineFracture() {
        const now = Date.now();
        manualJumpTimestamps.push(now);

        // Keep the array from growing too large by filtering out old timestamps
        manualJumpTimestamps = manualJumpTimestamps.filter(ts => now - ts < FRACTURE_THRESHOLD_TIME_MS);

        if (manualJumpTimestamps.length >= FRACTURE_THRESHOLD_COUNT) {
            manualJumpTimestamps = []; // Reset counter to prevent immediate re-triggering
            triggerTimelineFracture();
        }
    }

    function triggerTimelineFracture() {
        if (isTraveling) return;
        isTraveling = true; // Lock all controls

        fractureOverlay.classList.remove('hidden');
        addJournalEntry('Timeline fractured due to rapid manual travel.', 'paradox');

        const originalYear = yearDisplay.textContent;
        const dashboardSections = gsap.utils.toArray('.dashboard-section');

        // Use a single GSAP timeline for all scrambling and cleanup
        const tl = gsap.timeline({
            onComplete: () => {
                // This will reliably run after the entire timeline is complete
                yearDisplay.textContent = originalYear;
                fractureOverlay.classList.add('hidden');
                isTraveling = false; // Unlock controls
            }
        });

        // Scramble the year display using GSAP's ticker for synchronization
        tl.to({ val: 0 }, { // Dummy object to animate on
            duration: FRACTURE_DURATION_S,
            onUpdate: function() {
                // onUpdate runs every frame of the animation
                // We update text less frequently than every frame to avoid being a blur
                if (this.progress() * 100 % 2 < 1) { 
                    yearDisplay.textContent = Math.floor(Math.random() * 9999) - 5000;
                }
            }
        }, 0); // Start at the beginning of the timeline

        // Scramble the dashboard panels
        tl.to(dashboardSections, {
            x: () => Math.random() * 10 - 5,
            y: () => Math.random() * 10 - 5,
            rotation: () => Math.random() * 4 - 2,
            duration: 0.1,
            repeat: (FRACTURE_DURATION_S * 10) - 1, // Repeat for the duration
            yoyo: true
        }, 0); // Also start at the beginning
    }

    function triggerEventCollapse() {
        const visibleCards = document.querySelectorAll('.event-card:not(.faded)');
        
        // Only trigger a collapse if there is more than one card that can be faded.
        if (visibleCards.length > 1) {
            addJournalEntry('Timeline instability detected. Events are fading.', 'paradox');
            collapseOverlay.classList.remove('hidden');
            setTimeout(() => collapseOverlay.classList.add('hidden'), 3000);

            // To make it more interesting, we fade one of the less "important" cards if possible
            const cardToFade = Array.from(visibleCards).reverse().find(card => card.dataset.type !== 'paradox') || visibleCards[0];
            cardToFade.classList.add('faded');
            // Restart the timer to potentially fade another card if the user keeps waiting
            eraStayTimer = setTimeout(triggerEventCollapse, ERA_STAY_DURATION_MS);
        }
        // If there's only one card left, do nothing. The timer will not be reset.
    }

    /**
     * Handles a manual jump, applying debouncing to the event display.
     * @param {number} direction - -1 for back, 1 for forward.
     */
    function handleManualJump(direction) {
        if (isTraveling) return;

        // Clear any pending event display from the previous jump
        clearTimeout(manualJumpDebounceTimer);
        // Clear the era timer as soon as the user interacts
        clearTimeout(eraStayTimer);
        currentEra = null; // We are no longer "staying" in an era

        currentYear += direction;
        yearDisplay.textContent = currentYear;
        checkForTimelineFracture();

        // Set a new timer to display events after a short delay
        manualJumpDebounceTimer = setTimeout(() => {
            displayEventsForCurrentYear();
            // Once events are displayed and user has stopped, start the era timer
            currentEra = getEra(currentYear);
            eraStayTimer = setTimeout(triggerEventCollapse, ERA_STAY_DURATION_MS);
        }, 300); // Wait 300ms after the last click
    }

    /**
     * Starts or changes the direction of time travel.
     * @param {number} direction - 1 for future, -1 for past.
     */
    function startTravel(direction) {
        if (isTraveling) {
            clearInterval(travelInterval); // Stop current travel to change direction
        }
        // Clear the era timer as soon as we start traveling
        clearTimeout(eraStayTimer);
        currentEra = null;

        isTraveling = true;
        renderEvents([]); // Clear event cards
        travelInterval = setInterval(() => {
            currentYear += direction;
            yearDisplay.textContent = currentYear;
        }, TRAVEL_SPEED_MS);
    }

    function pauseTravel() {
        if (!isTraveling) return;
        isTraveling = false;
        clearInterval(travelInterval);
        displayEventsForCurrentYear();

        // After displaying events, start the era timer
        currentEra = getEra(currentYear);
        eraStayTimer = setTimeout(triggerEventCollapse, ERA_STAY_DURATION_MS);
    }

    async function initializeGame() {
        initParticles();
        yearDisplay.textContent = currentYear;

        // Animate the static parts of the UI
        const tl = gsap.timeline();
        tl.to('.main-header h1, .main-header p', { opacity: 1, duration: 1, stagger: 0.2 });
        tl.to('.dashboard', { opacity: 1, duration: 0.8 }, "-=0.5");

        // Load saved achievements from browser storage
        const savedUnlocks = JSON.parse(localStorage.getItem('unlockedAchievements')) || [];
        unlockedAchievementIds = new Set(savedUnlocks);

        // Load saved journal and discoveries
        const savedJournal = JSON.parse(localStorage.getItem('journalEntries')) || []; // <-- LOADING THE DATA
        journalEntries = savedJournal;
        const savedDiscoveries = JSON.parse(localStorage.getItem('discoveredEventIds')) || [];
        discoveredEventIds = new Set(savedDiscoveries);

        if (journalEntries.length === 0) {
            addJournalEntry('Time machine initialized. System ready.');
        }
        renderJournal(); // Initial render

        // Fetch all game data
        try {
            const [eventsResponse, achievementsResponse] = await Promise.all([
                fetch('events.json'),
                fetch('achievements.json')
            ]);
            if (!eventsResponse.ok || !achievementsResponse.ok) {
                throw new Error('Failed to fetch game data.');
            }
            allEvents = await eventsResponse.json();
            allAchievements = await achievementsResponse.json();
            renderAchievementsList(); // Initial render of the achievement list
        } catch (error) {
            console.error("Could not load event data:", error);
            dataCategoryContainer.innerHTML = `<p class="no-events">Error: Could not load timeline data. Please check the console.</p>`;
        }
    }

    // --- Event Listeners ---

    forwardTravelBtn.addEventListener('click', () => startTravel(1));
    backwardTravelBtn.addEventListener('click', () => startTravel(-1));
    pauseBtn.addEventListener('click', pauseTravel);
    backBtn.addEventListener('click', () => handleManualJump(-1));
    forwardBtn.addEventListener('click', () => handleManualJump(1));

    categoryFilter.addEventListener('change', () => {
        if (!isTraveling) {
            displayEventsForCurrentYear();
        }
    });

    journalBtn.addEventListener('click', () => journalModal.classList.remove('hidden'));
    closeJournalBtn.addEventListener('click', () => journalModal.classList.add('hidden'));

    achievementsBtn.addEventListener('click', () => achievementsModal.classList.remove('hidden'));
    closeAchievementsBtn.addEventListener('click', () => achievementsModal.classList.add('hidden'));

    closeParadoxBtn.addEventListener('click', () => paradoxModal.classList.add('hidden'));

    // --- Start the Game ---
    initializeGame();
});
