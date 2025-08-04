let ws = null;
let username = '';
let currentRoom = '';
let isConnected = false;
let isAuthenticated = false;
let currentUser = null;
let isReconnecting = false;
let connectionTimeout = null;
let heartbeatInterval = null;
let selectedFile = null;
let isUploading = false;
let isUserScrolledUp = false;
let pendingMessages = 0;
let isJoiningRoom = false; // Add state to prevent double room joining

const authSection = document.getElementById('authSection');
const loginOptions = document.getElementById('loginOptions');
const userInfo = document.getElementById('userInfo');
const joinForm = document.getElementById('joinForm');
const createPublicRoomBtn = document.getElementById('createPublicRoomBtn');
const loginScreen = document.getElementById('loginScreen');
const chatInterface = document.getElementById('chatInterface');
const roomTitle = document.getElementById('roomTitle');
const connectionStatus = document.getElementById('connectionStatus');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const roomsList = document.getElementById('rooms');

// Debug logging function (console only)
function debugLog(message) {
    console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
}

// Check if all required elements exist
function checkRequiredElements() {
    const required = {
        'authSection': authSection,
        'loginOptions': loginOptions,
        'userInfo': userInfo,
        'joinForm': joinForm,
        'createPublicRoomBtn': createPublicRoomBtn,
        'loginScreen': loginScreen,
        'chatInterface': chatInterface
    };
    
    for (const [name, element] of Object.entries(required)) {
        if (!element) {
            console.error(`Required element missing: ${name}`);
        } else {
            console.log(`Element found: ${name}`);
        }
    }
}

// Authentication functions
function loginWith(provider) {
    console.log('LOGIN BUTTON CLICKED - Provider:', provider);
    debugLog(`Attempting to login with ${provider}`);
    window.location.href = `/auth/${provider}`;
}

function logout() {
    debugLog('Logging out...');
    
    // Stop heartbeat and close WebSocket connection before logout
    stopHeartbeat();
    if (ws) {
        ws._intentionalClose = true;
        ws.close(1000, 'User logout');
    }
    
    // Clear saved room on logout
    localStorage.removeItem('currentRoom');
    
    fetch('/auth/logout', { method: 'POST' })
        .then(() => {
            isAuthenticated = false;
            currentUser = null;
            currentRoom = '';
            isConnected = false;
            updateAuthUI();
        })
        .catch(error => {
            debugLog(`Logout error: ${error}`);
        });
}

function checkAuth() {
    debugLog('Checking authentication status...');
    return fetch('/auth/check')
        .then(response => response.json())
        .then(data => {
            debugLog(`Auth check response: ${JSON.stringify(data)}`);
            isAuthenticated = data.authenticated;
            if (data.authenticated) {
                currentUser = data.user;
                username = data.user.name;
            }
            updateAuthUI();
            return data.authenticated;
        })
        .catch(error => {
            debugLog(`Auth check error: ${error}`);
            isAuthenticated = false;
            updateAuthUI();
            return false;
        });
}

// Removed auto-rejoin functionality - users will manually select rooms after refresh
// function restoreSavedRoom() {
//     if (!isAuthenticated) {
//         debugLog('Not authenticated, cannot restore saved room');
//         return;
//     }
//     
//     const savedRoom = localStorage.getItem('currentRoom');
//     if (savedRoom && savedRoom.trim()) {
//         debugLog(`Found saved room: ${savedRoom}, attempting to rejoin...`);
//         // Smaller delay since UI is already properly set
//         setTimeout(() => {
//             joinRoomByName(savedRoom);
//         }, 100);
//     } else {
//         debugLog('No saved room found');
//     }
// }

function updateAuthUI() {
    if (isAuthenticated && currentUser) {
        loginOptions.classList.add('hidden');
        userInfo.classList.remove('hidden');
        joinForm.classList.remove('hidden');
        
        document.getElementById('userName').textContent = currentUser.name;
        document.getElementById('userEmail').textContent = currentUser.email || '';
        
        debugLog(`Setting up avatar. Avatar URL: ${currentUser.avatar}`);
        if (currentUser.avatar) {
            const avatarElement = document.getElementById('userAvatar');
            avatarElement.style.backgroundImage = `url(${currentUser.avatar})`;
            debugLog(`Avatar set successfully to: ${currentUser.avatar}`);
        } else {
            debugLog('No avatar URL found in user data');
        }
        
        // Always show login screen when user is authenticated, don't auto-rejoin rooms
        chatInterface.classList.add('hidden');
        loginScreen.classList.remove('hidden');
    } else {
        loginOptions.classList.remove('hidden');
        userInfo.classList.add('hidden');
        joinForm.classList.add('hidden');
        chatInterface.classList.add('hidden');
        loginScreen.classList.remove('hidden');
    }
}

// Create public room - now uses popup instead of input field
createPublicRoomBtn.addEventListener('click', createPublicRoom);
// Removed roomname input event listener - using popup instead

// Send message
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Add paste event listener for image pasting
messageInput.addEventListener('paste', handlePaste);

// Add scroll event listener to detect manual scrolling
if (messagesContainer) {
    messagesContainer.addEventListener('scroll', handleScroll);
    
    // Add MutationObserver to detect DOM changes that might affect scrolling
    const messagesObserver = new MutationObserver((mutations) => {
        let shouldScroll = false;
        
        mutations.forEach((mutation) => {
            // Check if new nodes were added (new messages)
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('message')) {
                        // A new message was added - check if we should auto-scroll
                        if (!isUserScrolledUp) {
                            shouldScroll = true;
                        }
                    }
                });
            }
        });
        
        if (shouldScroll) {
            // Use a slight delay to allow for image loading
            setTimeout(() => {
                if (!isUserScrolledUp) {
                    scrollToBottom();
                    debugLog('MutationObserver triggered scroll for new message');
                }
            }, 100);
        }
    });
    
    // Observe the messages container for child list changes
    messagesObserver.observe(messagesContainer, {
        childList: true,
        subtree: true
    });
}

function createPublicRoom() {
    if (!isAuthenticated) {
        alert('Please login first');
        return;
    }

    // Show custom modal instead of prompt
    showPublicRoomModal();
}

function showPublicRoomModal() {
    const modal = document.getElementById('publicRoomModal');
    const input = document.getElementById('publicRoomName');
    
    // Clear previous input
    input.value = '';
    
    // Show modal
    modal.style.display = 'flex';
    
    // Focus on input field
    setTimeout(() => {
        input.focus();
    }, 100);
    
    // Handle Enter key in input
    input.onkeypress = function(e) {
        if (e.key === 'Enter') {
            submitPublicRoom();
        }
    };
}

function closePublicRoomModal() {
    const modal = document.getElementById('publicRoomModal');
    modal.style.display = 'none';
}

function submitPublicRoom() {
    const input = document.getElementById('publicRoomName');
    const roomName = input.value.trim();

    if (!roomName) {
        // Focus back on input if empty
        input.focus();
        return;
    }

    // Close modal
    closePublicRoomModal();

    // Call the API to create a public room
    fetch('/api/rooms/public', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
            roomName: roomName
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
            return;
        }
        
        // Join the newly created room
        joinRoomByName(data.room.name);
        
        // Refresh the rooms list
        loadActiveRooms();
    })
    .catch(error => {
        console.error('Error creating public room:', error);
        alert('Failed to create public room');
    });
}

function joinRoomByName(roomName) {
    debugLog(`=== joinRoomByName called with: ${roomName} ===`);
    debugLog(`Current state - currentRoom: ${currentRoom}, isConnected: ${isConnected}, isJoiningRoom: ${isJoiningRoom}, isReconnecting: ${isReconnecting}`);
    
    if (!isAuthenticated) {
        alert('Please login first');
        return;
    }

    if (!roomName) {
        alert('Invalid room name');
        return;
    }

    // Check if already in the same room
    if (currentRoom === roomName && isConnected && ws && ws.readyState === WebSocket.OPEN) {
        debugLog(`Already in room: ${roomName}, no action needed`);
        // User is already in this room and connected, no need to do anything
        return;
    }

    // Check if already joining a room to prevent double clicks
    if (isJoiningRoom) {
        debugLog(`Already joining a room, ignoring click for: ${roomName}`);
        return;
    }

    debugLog(`Switching from room "${currentRoom}" to room "${roomName}"`);
    
    // Set joining state to prevent double clicks
    isJoiningRoom = true;
    debugLog(`Set isJoiningRoom = true`);
    
    // Set a shorter timeout to reset joining state in case something goes wrong
    setTimeout(() => {
        if (isJoiningRoom) {
            debugLog('Resetting joining state due to timeout');
            isJoiningRoom = false;
        }
    }, 6000); // 6 second timeout (slightly longer than connection timeout)
    
    // Save current room to localStorage
    localStorage.setItem('currentRoom', roomName);
    
    // Cancel any pending connection timeout
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
    }
    
    // Reset connection flags
    isReconnecting = false;
    
    currentRoom = roomName;
    debugLog(`Updated currentRoom to: ${currentRoom}`);
    
    // Reset connection status
    isConnected = false;
    updateConnectionStatus('Connecting...');

    debugLog(`Attempting to join room: ${roomName} as user: ${username}`);
    connectWebSocket();
}

function connectWebSocket() {
    debugLog(`=== connectWebSocket called ===`);
    debugLog(`Current state - isReconnecting: ${isReconnecting}, currentRoom: ${currentRoom}`);
    
    if (isReconnecting) {
        debugLog('Connection already in progress, skipping...');
        return;
    }
    
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws`;
    debugLog(`Connecting to WebSocket: ${wsUrl}`);

    isReconnecting = true;
    debugLog(`Set isReconnecting = true`);
    
    // Set a timeout to reset reconnecting state if connection takes too long
    const connectionTimeoutId = setTimeout(() => {
        if (isReconnecting && (!ws || ws.readyState === WebSocket.CONNECTING)) {
            debugLog('Connection timeout - resetting reconnecting state');
            isReconnecting = false;
            isJoiningRoom = false;
            updateConnectionStatus('Connection timeout');
        }
    }, 5000); // 5 second timeout
    
    // Store timeout ID to clear it later
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
    }
    connectionTimeout = connectionTimeoutId;

    // Close existing connection if any and proceed immediately
    if (ws && ws.readyState !== WebSocket.CLOSED) {
        debugLog('Closing existing WebSocket connection...');
        // Set a flag to indicate this is an intentional close
        ws._intentionalClose = true;
        
        // Close the connection
        ws.close(1000, 'Switching rooms');
        
        // Force immediate cleanup and proceed with new connection
        ws = null;
        debugLog('Forced WebSocket cleanup, proceeding immediately with new connection');
        createNewWebSocket(wsUrl);
    } else {
        debugLog('No existing WebSocket or already closed, creating new connection');
        createNewWebSocket(wsUrl);
    }
}

function createNewWebSocket(wsUrl) {
    debugLog('=== createNewWebSocket called ===');
    debugLog(`Current state - isReconnecting: ${isReconnecting}, isJoiningRoom: ${isJoiningRoom}`);
    debugLog(`Existing WebSocket state: ${ws ? `readyState=${ws.readyState}` : 'null'}`);
    
    // Don't check existing WebSocket state when switching rooms
    // The connection close handler should have already cleared the old connection
    
    // Clear connection timeout since we're proceeding with connection
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
        debugLog('Cleared connection timeout');
    }
    
    // Clear any existing WebSocket reference
    ws = null;
    debugLog('Cleared WebSocket reference');
    
    try {
        debugLog(`Creating WebSocket connection to: ${wsUrl}`);
        ws = new WebSocket(wsUrl);
        debugLog('WebSocket object created successfully');
    } catch (error) {
        debugLog(`Error creating WebSocket: ${error}`);
        isReconnecting = false;
        isJoiningRoom = false;
        updateConnectionStatus('Connection failed');
        return;
    }

    ws.onopen = function() {
        debugLog('=== WebSocket OPENED successfully ===');
        debugLog(`Connection opened! Current room: ${currentRoom}, Username: ${username}`);
        debugLog(`State before reset - isReconnecting: ${isReconnecting}, isJoiningRoom: ${isJoiningRoom}`);
        
        // Reset connection state immediately
        isReconnecting = false;
        isConnected = true;
        
        // Clear connection timeout on successful connection
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
            debugLog('Cleared connection timeout on open');
        }
        
        // Send join request immediately
        const joinRequest = {
            username: username,
            room: currentRoom
        };
        debugLog(`Sending join request: ${JSON.stringify(joinRequest)}`);
        
        try {
            ws.send(JSON.stringify(joinRequest));
            debugLog('Join request sent successfully via WebSocket');
            
            // Reset joining state since we've successfully connected and joined
            isJoiningRoom = false;
            debugLog(`Reset isJoiningRoom = false after successful join`);
            
            // Start heartbeat
            startHeartbeat();
            debugLog('Heartbeat started');
            
            // Update UI and status after successful join
            updateUI();
            debugLog('UI updated after successful join');
            
            // Load room history after a short delay to avoid disrupting the connection
            setTimeout(() => {
                if (isConnected && ws && ws.readyState === WebSocket.OPEN) {
                    debugLog('Loading room history...');
                    loadRoomHistory(true);
                    // Use instant scroll for initial room join
                    setTimeout(() => {
                        debugLog('Scrolling to bottom after room history load');
                        scrollToBottomInstant();
                    }, 1000);
                }
            }, 500);
            
            debugLog('=== Room join process completed successfully ===');
            
        } catch (error) {
            debugLog(`Error sending join request: ${error}`);
            isReconnecting = false;
            isJoiningRoom = false;
            updateConnectionStatus('Join request failed');
        }
    };

    ws.onmessage = function(event) {
        debugLog(`Received WebSocket message: ${event.data}`);
        try {
            const message = JSON.parse(event.data);
            debugLog(`Parsed message: ${JSON.stringify(message)}`);
            
            // Handle different message types
            if (message.type === 'delete') {
                handleMessageDeletion(message.id);
            } else if (message.type === 'reaction_update') {
                updateMessageReactions(message);
            } else if (message.type === 'room_update') {
                handleRoomUpdate(message);
            } else {
                displayMessage(message);
            }
        } catch (error) {
            debugLog(`Error parsing message: ${error}`);
        }
    };

    ws.onclose = function(event) {
        debugLog(`WebSocket disconnected: Code ${event.code}, Reason: ${event.reason}`);
        isConnected = false;
        isReconnecting = false;
        isJoiningRoom = false; // Reset joining state on close
        stopHeartbeat();
        
        // Clear connection timeout on close
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
        }
        
        // Don't show "Disconnected" for intentional closes (room switching)
        const wasIntentional = this._intentionalClose || event.code === 1000;
        
        if (!wasIntentional) {
            updateConnectionStatus('Disconnected');
        }
        
        // Only try to reconnect if it was an unexpected disconnection and we're still in a room
        if (!wasIntentional && currentRoom && isAuthenticated) {
            debugLog('Unexpected disconnection, will attempt to reconnect...');
            setTimeout(() => {
                if (!isConnected && !isReconnecting && currentRoom && isAuthenticated) {
                    debugLog('Attempting to reconnect...');
                    updateConnectionStatus('Reconnecting...');
                    connectWebSocket();
                }
            }, 3000);
        } else {
            debugLog('Not reconnecting - intentional close or normal closure');
        }
    };

    ws.onerror = function(error) {
        debugLog(`WebSocket error: ${error}`);
        updateConnectionStatus('Connection error');
        isConnected = false;
        isReconnecting = false;
        isJoiningRoom = false; // Reset joining state on error
        stopHeartbeat();
        
        // Clear connection timeout on error
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
        }
    };
}

function startHeartbeat() {
    // Stop any existing heartbeat
    stopHeartbeat();
    
    // Send a ping every 30 seconds to keep connection alive
    heartbeatInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                // Send a simple ping message
                ws.send(JSON.stringify({ type: 'ping' }));
                debugLog('Heartbeat ping sent');
            } catch (error) {
                debugLog(`Heartbeat ping failed: ${error}`);
                isConnected = false;
                updateConnectionStatus('Connection lost');
            }
        } else {
            debugLog('WebSocket not open during heartbeat check');
            isConnected = false;
            updateConnectionStatus('Connection lost');
            stopHeartbeat();
        }
    }, 30000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        debugLog('Heartbeat stopped');
    }
}

function sendMessage() {
    // Check if we have a selected file to upload
    if (selectedFile) {
        sendMediaMessage();
        return;
    }

    const text = messageInput.value.trim();
    debugLog(`sendMessage called with text: "${text}"`);
    debugLog(`isConnected: ${isConnected}`);
    debugLog(`WebSocket readyState: ${ws ? ws.readyState : 'null'}`);
    
    if (!text || text.length === 0) {
        debugLog('No text to send - empty or whitespace only');
        return;
    }
    
    // Check WebSocket state
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        debugLog(`WebSocket is not open. ReadyState: ${ws ? ws.readyState : 'null'}`);
        alert('Connection lost. Please refresh and try again.');
        return;
    }

    // Check if the text contains a media URL
    const mediaUrl = detectMediaUrl(text);
    if (mediaUrl) {
        debugLog(`Detected media URL: ${mediaUrl}`);
        sendUrlMediaMessage(mediaUrl, text);
        return;
    }

    const message = {
        text: text,
        type: 'message'
    };
    
    // Add reply information if replying to a message
    if (currentReply) {
        message.replyTo = {
            id: currentReply.id,
            sender: currentReply.sender,
            text: currentReply.text
        };
        debugLog(`Including reply to message ${currentReply.id}`);
    }

    debugLog(`Sending message: ${JSON.stringify(message)}`);
    try {
        ws.send(JSON.stringify(message));
        messageInput.value = '';
        
        // Clear reply state after sending
        if (currentReply) {
            cancelReply();
        }
        
        // Force scroll to bottom when user sends a message
        isUserScrolledUp = false; // Reset scroll state
        setTimeout(() => scrollToBottom(), 100); // Small delay to ensure message is rendered
        
        debugLog('Message sent successfully and scrolled to bottom');
    } catch (error) {
        debugLog(`Error sending message: ${error}`);
        alert('Failed to send message. Please try again.');
    }
}

function displayMessage(message, isFromHistory = false) {
    debugLog(`Displaying message: ${JSON.stringify(message)}, isFromHistory: ${isFromHistory}`);
    debugLog(`Current username: "${username}", Message sender: "${message.sender}"`);
    
    // Filter out empty or invalid messages (but allow media, join, and leave messages)
    if (!message || (message.type !== 'media' && message.type !== 'join' && message.type !== 'leave' && (!message.text || typeof message.text !== 'string' || message.text.trim() === ''))) {
        debugLog('Skipping empty or invalid message');
        return;
    }
    
    const messageEl = document.createElement('div');
    
    if (message.type === 'join' || message.type === 'leave') {
        messageEl.className = `message system${isFromHistory ? ' no-animation' : ''}`;
        messageEl.innerHTML = `<div>${processLinksInText(escapeHtml(message.text))}</div>`;
        debugLog('Created system message element');
    } else if (message.type === 'media') {
        const isOwnMessage = message.sender === username;
        messageEl.className = `message ${isOwnMessage ? 'own' : 'other'}${isFromHistory ? ' no-animation' : ''}`;
        messageEl.setAttribute('data-message-id', message.id); // Add message ID as data attribute
        
        // Use shorter time format (just hours:minutes)
        const time = new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        // Get avatar URL - use current user's avatar for own messages, or try to get from message data
        let avatarUrl = '';
        if (isOwnMessage && currentUser && currentUser.avatar) {
            avatarUrl = currentUser.avatar;
        } else if (message.avatar) {
            avatarUrl = message.avatar;
        }
        
        // Create avatar element
        const avatarHtml = avatarUrl ? 
            `<div class="message-avatar" style="background-image: url(${escapeHtml(avatarUrl)})"></div>` :
            `<div class="message-avatar-placeholder">${escapeHtml(message.sender.charAt(0).toUpperCase())}</div>`;
        
        // Create media content
        let mediaHtml = '';
        if (message.mediaType === 'image') {
            mediaHtml = `
                <div class="message-media">
                    <img src="${escapeHtml(message.mediaUrl)}" alt="Shared image" onclick="openImageModal('${escapeHtml(message.mediaUrl)}')">
                </div>
            `;
        } else if (message.mediaType === 'video') {
            mediaHtml = `
                <div class="message-media">
                    <video src="${escapeHtml(message.mediaUrl)}" controls>
                        Your browser does not support the video tag.
                    </video>
                </div>
            `;
        }
        
        // Create text content if present
        const textHtml = message.text && message.text.trim() ? 
            `<div class="message-text">${processLinksInText(escapeHtml(message.text))}</div>` : '';
        
        // Create delete button for own messages
        const deleteButtonHtml = isOwnMessage ? 
            `<button class="message-delete-btn" onclick="deleteMessage('${escapeHtml(message.id)}')" title="Delete message">×</button>` : '';
        
        // Create reply button for all messages (except system messages)
        const replyButtonHtml = (message.type !== 'join' && message.type !== 'leave') ? 
            `<button class="message-reply-btn" onclick="replyToMessage('${escapeHtml(message.id)}', '${escapeHtml(message.sender)}', '${escapeHtml(message.text || 'Media message')}')" title="Reply to message">↩</button>` : '';
        
        // Create reply reference if this message is a reply
        const replyReferenceHtml = message.replyTo ? 
            `<div class="message-reply-reference" onclick="scrollToMessage('${escapeHtml(message.replyTo.id)}')">
                <div class="reply-reference-header">
                    <span class="reply-icon">↩</span>
                    <span class="reply-reference-sender">${escapeHtml(message.replyTo.sender)}</span>
                </div>
                <div class="reply-reference-content">${escapeHtml(message.replyTo.text || 'Media message')}</div>
            </div>` : '';

        // Create reactions display
        const reactionsHtml = createReactionsHtml(message.reactions || [], message.id);

        // Create emoji picker button (only for non-system messages)
        const emojiButtonHtml = (message.type !== 'join' && message.type !== 'leave') ? 
            `<button class="message-emoji-btn" onclick="toggleEmojiPicker('${escapeHtml(message.id)}')" title="Add reaction">😀</button>` : '';
        
        if (isOwnMessage) {
            messageEl.innerHTML = `
                ${avatarHtml}
                <div class="message-content">
                    <div class="message-info">${escapeHtml(message.sender)} • ${time}</div>
                    ${replyReferenceHtml}
                    ${textHtml}
                    ${mediaHtml}
                    ${reactionsHtml}
                </div>
                ${replyButtonHtml}
                ${emojiButtonHtml}
                ${deleteButtonHtml}
            `;
        } else {
            messageEl.innerHTML = `
                ${avatarHtml}
                <div class="message-content">
                    <div class="message-info">${escapeHtml(message.sender)} • ${time}</div>
                    ${replyReferenceHtml}
                    ${textHtml}
                    ${mediaHtml}
                    ${reactionsHtml}
                </div>
                ${replyButtonHtml}
                ${emojiButtonHtml}
            `;
        }
        
        debugLog(`Created ${isOwnMessage ? 'own' : 'other'} media message element`);
    } else {
        const isOwnMessage = message.sender === username;
        messageEl.className = `message ${isOwnMessage ? 'own' : 'other'}${isFromHistory ? ' no-animation' : ''}`;
        messageEl.setAttribute('data-message-id', message.id); // Add message ID as data attribute
        
        // Use shorter time format (just hours:minutes)
        const time = new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        // Get avatar URL - use current user's avatar for own messages, or try to get from message data
        let avatarUrl = '';
        if (isOwnMessage && currentUser && currentUser.avatar) {
            avatarUrl = currentUser.avatar;
        } else if (message.avatar) {
            avatarUrl = message.avatar;
        }
        
        // Create avatar element
        const avatarHtml = avatarUrl ? 
            `<div class="message-avatar" style="background-image: url(${escapeHtml(avatarUrl)})"></div>` :
            `<div class="message-avatar-placeholder">${escapeHtml(message.sender.charAt(0).toUpperCase())}</div>`;
        
        // Create delete button for own messages
        const deleteButtonHtml = isOwnMessage ? 
            `<button class="message-delete-btn" onclick="deleteMessage('${escapeHtml(message.id)}')" title="Delete message">×</button>` : '';
        
        // Create reply button for all messages (except system messages)
        const replyButtonHtml = (message.type !== 'join' && message.type !== 'leave') ? 
            `<button class="message-reply-btn" onclick="replyToMessage('${escapeHtml(message.id)}', '${escapeHtml(message.sender)}', '${escapeHtml(message.text || 'Media message')}')" title="Reply to message">↩</button>` : '';
        
        // Create reply reference if this message is a reply
        const replyReferenceHtml = message.replyTo ? 
            `<div class="message-reply-reference" onclick="scrollToMessage('${escapeHtml(message.replyTo.id)}')">
                <div class="reply-reference-header">
                    <span class="reply-icon">↩</span>
                    <span class="reply-reference-sender">${escapeHtml(message.replyTo.sender)}</span>
                </div>
                <div class="reply-reference-content">${escapeHtml(message.replyTo.text || 'Media message')}</div>
            </div>` : '';

        // Create reactions display
        const reactionsHtml = createReactionsHtml(message.reactions || [], message.id);

        // Create emoji picker button (only for non-system messages)
        const emojiButtonHtml = (message.type !== 'join' && message.type !== 'leave') ? 
            `<button class="message-emoji-btn" onclick="toggleEmojiPicker('${escapeHtml(message.id)}')" title="Add reaction">😀</button>` : '';
        
        if (isOwnMessage) {
            messageEl.innerHTML = `
                ${avatarHtml}
                <div class="message-content">
                    <div class="message-info">${escapeHtml(message.sender)} • ${time}</div>
                    ${replyReferenceHtml}
                    <div>${processLinksInText(escapeHtml(message.text))}</div>
                    ${reactionsHtml}
                </div>
                ${replyButtonHtml}
                ${emojiButtonHtml}
                ${deleteButtonHtml}
            `;
        } else {
            messageEl.innerHTML = `
                ${avatarHtml}
                <div class="message-content">
                    <div class="message-info">${escapeHtml(message.sender)} • ${time}</div>
                    ${replyReferenceHtml}
                    <div>${processLinksInText(escapeHtml(message.text))}</div>
                    ${reactionsHtml}
                </div>
                ${replyButtonHtml}
                ${emojiButtonHtml}
            `;
        }
        
        debugLog(`Created ${isOwnMessage ? 'own' : 'other'} message element with avatar`);
    }

    debugLog(`Messages container exists: ${!!messagesContainer}`);
    debugLog(`Appending message element to container`);
    messagesContainer.appendChild(messageEl);
    
    // Determine if this is the user's own message
    const isOwnMessage = message.sender === username;
    const shouldAutoScroll = isOwnMessage || !isUserScrolledUp;
    
    // Add ResizeObserver for media messages to handle size changes
    if (shouldAutoScroll && (message.type === 'media' || messageEl.querySelectorAll('img, video').length > 0)) {
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                // When the message element changes size (due to media loading), scroll to bottom
                if (shouldAutoScroll) {
                    setTimeout(() => scrollToBottom(), 10);
                    debugLog('ResizeObserver triggered scroll for media message');
                }
            }
        });
        
        // Observe the message element for size changes
        resizeObserver.observe(messageEl);
        
        // Stop observing after a reasonable time to prevent memory leaks
        setTimeout(() => {
            resizeObserver.disconnect();
            debugLog('ResizeObserver disconnected for message element');
        }, 5000);
    }
    
    // Check if we should auto-scroll or show notification
    // Always scroll for own messages, and scroll for any message (including join/leave) when user is at bottom
    if (isOwnMessage || !isUserScrolledUp) {
        // Auto-scroll for own messages or when user is at bottom (for all message types)
        if (isOwnMessage) {
            isUserScrolledUp = false; // Reset scroll state for own messages
        }
        // Use regular scrolling for normal message display
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        debugLog(`Auto-scrolled to bottom (own message: ${isOwnMessage}, at bottom: ${!isUserScrolledUp})`);
        
        // Enhanced scroll handling for media messages (images and videos)
        const mediaElements = messageEl.querySelectorAll('img, video');
        if (mediaElements.length > 0) {
            let loadedCount = 0;
            const totalMedia = mediaElements.length;
            const shouldAutoScroll = isOwnMessage || !isUserScrolledUp;
            
            // Function to scroll once all media is loaded
            const scrollAfterLoad = () => {
                loadedCount++;
                debugLog(`Media element ${loadedCount}/${totalMedia} loaded`);
                
                if (loadedCount === totalMedia && shouldAutoScroll) {
                    // Multiple scroll attempts for better reliability with longer delays
                    setTimeout(() => scrollToBottom(), 50);
                    setTimeout(() => scrollToBottom(), 150);
                    setTimeout(() => scrollToBottom(), 300);
                    setTimeout(() => scrollToBottom(), 500);
                    debugLog(`Scrolled to bottom after ${loadedCount}/${totalMedia} media elements loaded`);
                }
            };
            
            mediaElements.forEach((element, index) => {
                debugLog(`Setting up load handler for media element ${index + 1}: ${element.tagName}`);
                
                if (element.tagName.toLowerCase() === 'img') {
                    // For images, check if already loaded
                    if (element.complete) {
                        if (element.naturalHeight !== 0) {
                            // Image is loaded successfully
                            debugLog(`Image ${index + 1} already loaded`);
                            scrollAfterLoad();
                        } else {
                            // Image failed to load
                            debugLog(`Image ${index + 1} failed to load (naturalHeight = 0)`);
                            scrollAfterLoad();
                        }
                    } else {
                        // Image still loading
                        debugLog(`Image ${index + 1} still loading, setting up handlers`);
                        element.onload = () => {
                            debugLog(`Image ${index + 1} loaded successfully`);
                            scrollAfterLoad();
                        };
                        element.onerror = () => {
                            debugLog(`Image ${index + 1} failed to load`);
                            scrollAfterLoad();
                        };
                    }
                } else if (element.tagName.toLowerCase() === 'video') {
                    // For videos, check readyState
                    if (element.readyState >= 1) { // HAVE_METADATA or higher
                        debugLog(`Video ${index + 1} already has metadata`);
                        scrollAfterLoad();
                    } else {
                        debugLog(`Video ${index + 1} waiting for metadata`);
                        element.onloadedmetadata = () => {
                            debugLog(`Video ${index + 1} metadata loaded`);
                            scrollAfterLoad();
                        };
                        element.onerror = () => {
                            debugLog(`Video ${index + 1} failed to load`);
                            scrollAfterLoad();
                        };
                    }
                }
            });
            
            // Enhanced fallback: multiple attempts with increasing delays
            if (shouldAutoScroll) {
                setTimeout(() => {
                    scrollToBottom();
                    debugLog('Fallback scroll #1 for media message');
                }, 800);
                
                setTimeout(() => {
                    scrollToBottom();
                    debugLog('Fallback scroll #2 for media message');
                }, 1500);
                
                setTimeout(() => {
                    scrollToBottom();
                    debugLog('Final fallback scroll for media message');
                }, 2500);
            }
        }
    } else {
        // User is scrolled up and this is another user's message - show notification for regular messages only
        if (message.type !== 'join' && message.type !== 'leave') {
            pendingMessages++;
            showNewMessageNotification();
            debugLog(`User scrolled up - added to pending messages (${pendingMessages})`);
        } else {
            debugLog(`System message (${message.type}) displayed quietly while user scrolled up`);
        }
    }
    
    debugLog(`Total messages in container now: ${messagesContainer.children.length}`);
    debugLog(`Message successfully displayed in UI`);
}

function clearMessages() {
    debugLog('Clearing all messages from UI');
    messagesContainer.innerHTML = '';
    
    // Reset scroll state when clearing messages
    isUserScrolledUp = false;
    pendingMessages = 0;
    hideNewMessageNotification();
    
    debugLog('Messages cleared successfully');
}

function scrollToBottom() {
    if (messagesContainer) {
        // Store current scroll info for debugging
        const initialScrollTop = messagesContainer.scrollTop;
        const initialScrollHeight = messagesContainer.scrollHeight;
        
        // Regular scrolling (can be smooth if CSS allows)
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Double-check and force scroll if needed with multiple attempts
        setTimeout(() => {
            const newScrollHeight = messagesContainer.scrollHeight;
            const tolerance = 10; // Allow for small rounding differences
            
            if (messagesContainer.scrollTop < newScrollHeight - messagesContainer.clientHeight - tolerance) {
                messagesContainer.scrollTop = newScrollHeight;
                debugLog(`Force-scrolled to bottom (second attempt). Height changed: ${initialScrollHeight} -> ${newScrollHeight}`);
            }
        }, 20);
        
        // Third attempt for stubborn cases
        setTimeout(() => {
            const finalScrollHeight = messagesContainer.scrollHeight;
            const tolerance = 10;
            
            if (messagesContainer.scrollTop < finalScrollHeight - messagesContainer.clientHeight - tolerance) {
                messagesContainer.scrollTop = finalScrollHeight;
                debugLog(`Force-scrolled to bottom (third attempt). Final height: ${finalScrollHeight}`);
            }
        }, 100);
        
        debugLog(`Scrolled to bottom. Initial: ${initialScrollTop}/${initialScrollHeight}, Current: ${messagesContainer.scrollTop}/${messagesContainer.scrollHeight}`);
        
        // Reset scroll state and hide new message notification
        isUserScrolledUp = false;
        pendingMessages = 0;
        hideNewMessageNotification();
    }
}

function scrollToBottomInstant() {
    if (messagesContainer) {
        // Use scrollTo with instant behavior to ensure no smooth scrolling
        messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: 'instant'
        });
        
        // Fallback for older browsers - direct scrollTop assignment
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Double-check and force scroll if needed
        setTimeout(() => {
            if (messagesContainer.scrollTop < messagesContainer.scrollHeight - messagesContainer.clientHeight - 5) {
                messagesContainer.scrollTo({
                    top: messagesContainer.scrollHeight,
                    behavior: 'instant'
                });
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                debugLog('Force-scrolled to bottom instantly (second attempt)');
            }
        }, 10);
        
        debugLog(`Scrolled to bottom instantly. ScrollTop: ${messagesContainer.scrollTop}, ScrollHeight: ${messagesContainer.scrollHeight}`);
        
        // Reset scroll state and hide new message notification
        isUserScrolledUp = false;
        pendingMessages = 0;
        hideNewMessageNotification();
    }
}

function handleScroll() {
    if (!messagesContainer) return;
    
    const scrollTop = messagesContainer.scrollTop;
    const scrollHeight = messagesContainer.scrollHeight;
    const clientHeight = messagesContainer.clientHeight;
    
    // Check if user is near the bottom (within 50px)
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
    
    // Update scroll state
    const wasScrolledUp = isUserScrolledUp;
    isUserScrolledUp = !isNearBottom;
    
    // If user scrolled to bottom, clear pending messages and hide notification
    if (!isUserScrolledUp && wasScrolledUp) {
        pendingMessages = 0;
        hideNewMessageNotification();
        debugLog('User scrolled to bottom - cleared pending messages');
    }
    
    debugLog(`Scroll state: isUserScrolledUp=${isUserScrolledUp}, scrollTop=${scrollTop}, scrollHeight=${scrollHeight}, clientHeight=${clientHeight}`);
}

function showNewMessageNotification() {
    let notification = document.getElementById('newMessageNotification');
    
    // Create notification if it doesn't exist
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'newMessageNotification';
        notification.className = 'new-message-notification';
        notification.innerHTML = `
            <span id="pendingCount">1</span> new message(s)
            <button onclick="scrollToBottomAndClear()">↓</button>
        `;
        
        // Insert before messages container
        messagesContainer.parentNode.insertBefore(notification, messagesContainer);
    }
    
    // Update count and show
    const countElement = document.getElementById('pendingCount');
    if (countElement) {
        countElement.textContent = pendingMessages;
    }
    
    notification.classList.add('show');
    debugLog(`Showing new message notification with ${pendingMessages} pending messages`);
}

function hideNewMessageNotification() {
    const notification = document.getElementById('newMessageNotification');
    if (notification) {
        notification.classList.remove('show');
        debugLog('Hidden new message notification');
    }
}

function scrollToBottomAndClear() {
    scrollToBottom();
    hideNewMessageNotification();
}

function updateUI() {
    loginScreen.classList.add('hidden');
    chatInterface.classList.remove('hidden');
    roomTitle.textContent = `Room: ${currentRoom}`;
    updateConnectionStatus('Connected');
    messageInput.focus();
}

function updateConnectionStatus(status) {
    // Clear any existing text content
    connectionStatus.textContent = '';
    
    // Remove all status classes first
    connectionStatus.classList.remove('connecting', 'disconnected');
    
    if (status === 'Connected') {
        // Default state - no additional class needed (green)
    } else if (status === 'Disconnected' || status === 'Connection error' || status === 'Connection lost' || status === 'Connection failed') {
        connectionStatus.classList.add('disconnected');
    } else {
        // For 'Connecting...', 'Reconnecting...', etc.
        connectionStatus.classList.add('connecting');
    }
}

function loadRoomHistory(clearFirst = true) {
    if (!isAuthenticated) {
        debugLog('Not authenticated, skipping room history load');
        return;
    }
    
    // Clear existing messages when joining a new room (optional)
    if (clearFirst) {
        clearMessages();
    }
    
    debugLog(`Loading room history for: ${currentRoom}`);
    fetch(`/api/rooms/${encodeURIComponent(currentRoom)}/messages`)
        .then(response => {
            if (response.status === 401) {
                debugLog('Unauthorized - redirecting to login');
                isAuthenticated = false;
                updateAuthUI();
                return;
            }
            return response.json();
        })
        .then(data => {
            if (!data) return;
            debugLog(`Room history response: ${JSON.stringify(data)}`);
            if (data.messages && data.messages.length > 0) {
                // Sort messages by timestamp
                data.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                
                // Display historical messages - include text, media, join, and leave messages
                data.messages.forEach(message => {
                    // Display message if it has valid content or is a system message
                    if (message && 
                        (message.type === 'join' || 
                         message.type === 'leave' ||
                         (message.type === 'media' && message.mediaUrl) || 
                         (message.text && typeof message.text === 'string' && message.text.trim() !== ''))) {
                        displayMessage(message, true); // Pass true for isFromHistory
                    }
                });
                
                // Ensure instant scroll to bottom after all messages are loaded when joining/refreshing
                // Use multiple timeouts to handle different loading scenarios
                setTimeout(() => scrollToBottomInstant(), 50);
                setTimeout(() => scrollToBottomInstant(), 200);
                setTimeout(() => scrollToBottomInstant(), 500);
            }
        })
        .catch(error => {
            debugLog(`Error loading room history: ${error}`);
        });
}

function loadActiveRooms() {
    if (!isAuthenticated) {
        document.getElementById('rooms').innerHTML = '<div style="opacity: 0.6; font-size: 14px;">Login to see active rooms</div>';
        return;
    }
    
    // Trigger a room update broadcast from the server to get real-time data
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'request_room_update' }));
    } else {
        // Fallback to traditional API call if WebSocket not available
        fetch('/api/rooms')
            .then(response => {
                if (response.status === 401) {
                    debugLog('Unauthorized - redirecting to login');
                    isAuthenticated = false;
                    updateAuthUI();
                    return;
                }
                return response.json();
            })
            .then(data => {
                if (!data) return;
                const roomsContainer = document.getElementById('rooms');
                roomsContainer.innerHTML = '';
                
                if (data.rooms && data.rooms.length > 0) {
                    data.rooms.forEach(room => {
                        const roomEl = document.createElement('div');
                        roomEl.className = 'room-item';
                        if (room.name === currentRoom) {
                            roomEl.classList.add('active');
                        }
                        
                        // Add visual indicators for inactive membership
                        if (room.user_active === false) {
                            roomEl.classList.add('inactive-member');
                            roomEl.style.opacity = '0.7';
                            roomEl.style.border = '1px dashed var(--border-color)';
                        }
                        
                        // Add click event to join room
                        roomEl.addEventListener('click', () => {
                            debugLog(`Clicked on room: ${room.name}`);
                            debugLog(`Current state - currentRoom: ${currentRoom}, isConnected: ${isConnected}, isJoiningRoom: ${isJoiningRoom}, isReconnecting: ${isReconnecting}`);
                            
                            // Check if already in this room
                            if (currentRoom === room.name && isConnected && ws && ws.readyState === WebSocket.OPEN) {
                                debugLog(`Already in room: ${room.name}, ignoring click`);
                                return;
                            }
                            
                            // Check if already joining a room
                            if (isJoiningRoom) {
                                debugLog(`Already joining a room, ignoring click for: ${room.name}`);
                                return;
                            }
                            
                            if (room.user_active === false) {
                                // Show confirmation for inactive rooms
                                if (confirm(`You are no longer an active member of "${room.name}". Would you like to try to rejoin?`)) {
                                    joinRoomByName(room.name);
                                }
                            } else {
                                joinRoomByName(room.name);
                            }
                        });
                        
                        // Build status text
                        let statusText = '';
                        if (room.user_active === false) {
                            statusText = 'Left room';
                            if (room.memberCount && room.memberCount > 0) {
                                statusText += ` • ${room.memberCount} users still online`;
                            }
                        } else {
                            statusText = room.count ? `${room.count} users online` : `${room.memberCount || 0} users online`;
                        }
                        
                        roomEl.innerHTML = `
                            <div>
                                <strong>${escapeHtml(room.name)}</strong>
                                ${room.is_private ? '<span style="color: var(--secondary-color); font-size: 12px; margin-left: 5px;">🔒 Private</span>' : ''}
                                ${room.user_active === false ? '<span style="color: #ff6b6b; font-size: 12px; margin-left: 5px;">⚠ Inactive</span>' : ''}
                            </div>
                            <div style="font-size: 12px; opacity: 0.8;">${statusText}</div>
                        `;
                        roomsContainer.appendChild(roomEl);
                    });
                } else {
                    roomsContainer.innerHTML = '<div style="opacity: 0.6; font-size: 14px;">No active rooms</div>';
                }
            })
            .catch(error => {
                debugLog(`Error loading active rooms: ${error}`);
            });
    }
}

// Handle real-time room updates from WebSocket
function handleRoomUpdate(message) {
    debugLog(`Received room update: ${JSON.stringify(message)}`);
    
    if (!isAuthenticated) {
        return; // Don't update room list if not authenticated
    }
    
    // Update the active rooms display with real-time data
    updateActiveRoomsDisplay(message.rooms);
}

// Update the rooms display with real-time data
function updateActiveRoomsDisplay(activeRooms) {
    // First get the full room list from API to merge with active room data
    fetch('/api/rooms')
        .then(response => {
            if (response.status === 401) {
                debugLog('Unauthorized - redirecting to login');
                isAuthenticated = false;
                updateAuthUI();
                return;
            }
            return response.json();
        })
        .then(data => {
            if (!data) return;
            const roomsContainer = document.getElementById('rooms');
            roomsContainer.innerHTML = '';
            
            if (data.rooms && data.rooms.length > 0) {
                data.rooms.forEach(room => {
                    // Find active room data for this room
                    const activeRoom = activeRooms.find(ar => ar.name === room.name);
                    const activeClients = activeRoom ? activeRoom.clients : [];
                    const activeCount = activeRoom ? activeRoom.count : 0;
                    
                    const roomEl = document.createElement('div');
                    roomEl.className = 'room-item';
                    if (room.name === currentRoom) {
                        roomEl.classList.add('active');
                    }
                    
                    // Add visual indicators for inactive membership
                    if (room.user_active === false) {
                        roomEl.classList.add('inactive-member');
                        roomEl.style.opacity = '0.7';
                        roomEl.style.border = '1px dashed var(--border-color)';
                    }
                    
                    // Add click event to join room
                    roomEl.addEventListener('click', () => {
                        debugLog(`Clicked on room: ${room.name}`);
                        debugLog(`Current state - currentRoom: ${currentRoom}, isConnected: ${isConnected}, isJoiningRoom: ${isJoiningRoom}, isReconnecting: ${isReconnecting}`);
                        
                        // Check if already in this room
                        if (currentRoom === room.name && isConnected && ws && ws.readyState === WebSocket.OPEN) {
                            debugLog(`Already in room: ${room.name}, ignoring click`);
                            return;
                        }
                        
                        // Check if already joining a room
                        if (isJoiningRoom) {
                            debugLog(`Already joining a room, ignoring click for: ${room.name}`);
                            return;
                        }
                        
                        if (room.user_active === false) {
                            // Show confirmation for inactive rooms
                            if (confirm(`You are no longer an active member of "${room.name}". Would you like to try to rejoin?`)) {
                                joinRoomByName(room.name);
                            }
                        } else {
                            joinRoomByName(room.name);
                        }
                    });
                    
                    // Build status text with real-time active count
                    let statusText = '';
                    if (room.user_active === false) {
                        statusText = 'Left room';
                        if (activeCount > 0) {
                            statusText += ` • ${activeCount} users online`;
                        } else if (room.memberCount && room.memberCount > 0) {
                            statusText += ` • ${room.memberCount} users still members`;
                        }
                    } else {
                        statusText = `${activeCount} users online`;
                        if (room.memberCount && room.memberCount > activeCount) {
                            statusText += ` • ${room.memberCount} total members`;
                        }
                    }
                    
                    roomEl.innerHTML = `
                        <div>
                            <strong>${escapeHtml(room.name)}</strong>
                            ${room.is_private ? '<span style="color: var(--secondary-color); font-size: 12px; margin-left: 5px;">🔒 Private</span>' : ''}
                            ${room.user_active === false ? '<span style="color: #ff6b6b; font-size: 12px; margin-left: 5px;">⚠ Inactive</span>' : ''}
                            ${activeCount > 0 ? '<span style="color: #4CAF50; font-size: 12px; margin-left: 5px;">● Online</span>' : ''}
                        </div>
                        <div style="font-size: 12px; opacity: 0.8;">${statusText}</div>
                    `;
                    roomsContainer.appendChild(roomEl);
                });
                
                // Add any active public rooms that might not be in the database yet
                activeRooms.forEach(activeRoom => {
                    const found = data.rooms.find(room => room.name === activeRoom.name);
                    if (!found) {
                        const roomEl = document.createElement('div');
                        roomEl.className = 'room-item';
                        if (activeRoom.name === currentRoom) {
                            roomEl.classList.add('active');
                        }
                        
                        roomEl.addEventListener('click', () => {
                            debugLog(`Clicked on active room: ${activeRoom.name}`);
                            joinRoomByName(activeRoom.name);
                        });
                        
                        roomEl.innerHTML = `
                            <div>
                                <strong>${escapeHtml(activeRoom.name)}</strong>
                                <span style="color: #4CAF50; font-size: 12px; margin-left: 5px;">● Online</span>
                            </div>
                            <div style="font-size: 12px; opacity: 0.8;">${activeRoom.count} users online</div>
                        `;
                        roomsContainer.appendChild(roomEl);
                    }
                });
            } else {
                roomsContainer.innerHTML = '<div style="opacity: 0.6; font-size: 14px;">No active rooms</div>';
            }
        })
        .catch(error => {
            debugLog(`Error updating active rooms display: ${error}`);
        });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// URL media detection and handling
function detectMediaUrl(text) {
    // URL regex pattern to match HTTP/HTTPS URLs
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const urls = text.match(urlRegex);
    
    if (!urls) return null;
    
    // Check each URL to see if it's a media file
    for (const url of urls) {
        if (isMediaUrl(url)) {
            return url;
        }
    }
    
    return null;
}

function isMediaUrl(url) {
    // Remove query parameters for extension checking
    const urlWithoutParams = url.split('?')[0];
    
    // Common image extensions
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    // Common video extensions  
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv'];
    
    // Check if URL ends with media extension
    const hasMediaExtension = [...imageExtensions, ...videoExtensions].some(ext => 
        urlWithoutParams.toLowerCase().endsWith(ext)
    );
    
    // Also check for common media hosting patterns
    const mediaHostPatterns = [
        /cdn\.discordapp\.com\/attachments.*\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)/i,
        /imgur\.com.*\.(jpg|jpeg|png|gif|webp|mp4|webm)/i,
        /i\.imgur\.com/i,
        /media\.giphy\.com/i,
        /tenor\.com.*\.gif/i,
        /youtube\.com.*\.(mp4|webm)/i,
        /vimeo\.com.*\.(mp4|webm)/i
    ];
    
    const matchesHostPattern = mediaHostPatterns.some(pattern => pattern.test(url));
    
    return hasMediaExtension || matchesHostPattern;
}

function getMediaTypeFromUrl(url) {
    const urlWithoutParams = url.split('?')[0].toLowerCase();
    
    // Video extensions
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv'];
    if (videoExtensions.some(ext => urlWithoutParams.endsWith(ext))) {
        return 'video';
    }
    
    // Default to image for everything else
    return 'image';
}

function extractFilenameFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const filename = pathname.split('/').pop();
        return filename || 'media_file';
    } catch (e) {
        return 'media_file';
    }
}

// Function to convert URLs in text to clickable links
function processLinksInText(text) {
    if (!text) return text;
    
    // URL regex pattern to match HTTP/HTTPS URLs
    const urlRegex = /(https?:\/\/[^\s<>\"]+)/gi;
    
    return text.replace(urlRegex, (url) => {
        // Clean up the URL (remove trailing punctuation that shouldn't be part of the link)
        const cleanUrl = url.replace(/[.,;:!?]+$/, '');
        const trailingPunctuation = url.substring(cleanUrl.length);
        
        // Create a safe display text (truncate very long URLs)
        let displayText = cleanUrl;
        if (displayText.length > 50) {
            displayText = displayText.substring(0, 47) + '...';
        }
        
        // Create the link with proper attributes
        return `<a href="${escapeHtml(cleanUrl)}" target="_blank" rel="noopener noreferrer" class="message-link">${escapeHtml(displayText)}</a>${trailingPunctuation}`;
    });
}

function sendUrlMediaMessage(mediaUrl, originalText) {
    debugLog(`Sending URL-based media message: ${mediaUrl}`);
    
    // Extract any text that isn't the URL (for caption)
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const captionText = originalText.replace(urlRegex, '').trim();
    
    const mediaType = getMediaTypeFromUrl(mediaUrl);
    const fileName = extractFilenameFromUrl(mediaUrl);
    
    // Send media message via WebSocket
    const mediaMessage = {
        type: 'media',
        mediaUrl: mediaUrl,
        mediaType: mediaType,
        fileName: fileName,
        text: captionText // Include any additional text as caption
    };
    
    // Add reply information if replying to a message
    if (currentReply) {
        mediaMessage.replyTo = {
            id: currentReply.id,
            sender: currentReply.sender,
            text: currentReply.text
        };
        debugLog(`Including reply to message ${currentReply.id} in URL media message`);
    }

    debugLog(`Sending URL media message: ${JSON.stringify(mediaMessage)}`);
    try {
        ws.send(JSON.stringify(mediaMessage));
        messageInput.value = '';
        
        // Clear reply state after sending
        if (currentReply) {
            cancelReply();
        }
        
        // Enhanced scroll handling for URL media messages
        isUserScrolledUp = false; // Reset scroll state
        // Multiple scroll attempts with increasing delays to handle media loading
        setTimeout(() => scrollToBottom(), 50);
        setTimeout(() => scrollToBottom(), 200);
        setTimeout(() => scrollToBottom(), 500);
        setTimeout(() => scrollToBottom(), 1000);
        
        debugLog('URL media message sent successfully with enhanced scrolling');
    } catch (error) {
        debugLog(`Error sending URL media message: ${error}`);
        alert('Failed to send media message. Please try again.');
    }
}

// File upload handling
function handlePaste(event) {
    debugLog('Paste event detected');
    
    // Get clipboard data
    const clipboardData = event.clipboardData || window.Clipboard;
    if (!clipboardData) {
        debugLog('No clipboard data available');
        return;
    }

    // Check for files in clipboard
    const items = clipboardData.items;
    if (!items) {
        debugLog('No clipboard items available');
        return;
    }

    // Look for image files in clipboard
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        debugLog(`Clipboard item ${i}: kind=${item.kind}, type=${item.type}`);
        
        // Check if it's a file and an image
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            event.preventDefault(); // Prevent default paste behavior
            
            const file = item.getAsFile();
            if (file) {
                debugLog(`Pasted image file: ${file.name}, size: ${file.size}, type: ${file.type}`);

                // Validate file size (10MB for dev tunnel compatibility)
                const maxSize = 10 * 1024 * 1024; // 10MB
                if (file.size > maxSize) {
                    alert('Image too large. Maximum size is 10MB.');
                    return;
                }

                // Set as selected file and show preview
                selectedFile = file;
                showMediaPreview(file);
                
                debugLog('Image from paste set as selected file');
                return; // Exit after processing the first image
            }
        }
    }
    
    debugLog('No image found in paste data');
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    debugLog(`File selected: name=${file.name}, size=${file.size}, type=${file.type}`);

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/mov', 'video/avi'];
    if (!allowedTypes.includes(file.type)) {
        alert('File type not supported. Please upload an image (JPEG, PNG, GIF, WebP) or video (MP4, WebM, MOV, AVI).');
        debugLog(`File type not allowed: ${file.type}`);
        return;
    }

    // Validate file size (10MB for dev tunnel compatibility)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        alert('File too large. Maximum size is 10MB.');
        debugLog(`File too large: ${file.size} bytes (max: ${maxSize} bytes)`);
        return;
    }

    debugLog(`File validation passed, setting as selected file`);
    selectedFile = file;
    showMediaPreview(file);
}

function clearExistingPreviews() {
    const imagePreview = document.getElementById('mediaPreview');
    const videoPreview = document.getElementById('videoPreview');
    
    debugLog('Clearing existing previews only...');
    
    // Clear image preview
    imagePreview.classList.remove('show');
    imagePreview.style.display = 'none';
    
    // Clear video preview
    videoPreview.classList.remove('show');
    videoPreview.style.display = 'none';
    if (videoPreview.src && videoPreview.src.startsWith('blob:')) {
        videoPreview.pause();
        videoPreview.currentTime = 0;
    }
    
    // Revoke previous object URLs to prevent memory leaks
    if (imagePreview.src && imagePreview.src.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview.src);
        imagePreview.src = '';
    }
    if (videoPreview.src && videoPreview.src.startsWith('blob:')) {
        URL.revokeObjectURL(videoPreview.src);
        videoPreview.src = '';
    }
    
    // Remove event listeners
    imagePreview.onmousedown = null;
    imagePreview.ondblclick = null;
    imagePreview.onclick = null;
    videoPreview.onmousedown = null;
    videoPreview.ondblclick = null;
    
    // Remove delete buttons
    removeExistingDeleteButton();
    
    debugLog('Existing previews cleared');
}

function showMediaPreview(file) {
    debugLog(`showMediaPreview called with file: name=${file.name}, type=${file.type}, size=${file.size}`);
    
    // Clear any existing preview without resetting selectedFile
    clearExistingPreviews();
    
    const imagePreview = document.getElementById('mediaPreview');
    const videoPreview = document.getElementById('videoPreview');
    
    debugLog(`Elements found: imagePreview=${!!imagePreview}, videoPreview=${!!videoPreview}`);
    
    // Remove any existing click handlers and delete buttons
    imagePreview.onclick = null;
    videoPreview.onclick = null;
    removeExistingDeleteButton();
    
    const url = URL.createObjectURL(file);
    debugLog(`Created object URL: ${url}`);
    
    if (file.type.startsWith('image/')) {
        imagePreview.src = url;
        debugLog(`Image src set, adding show class...`);
        
        // Force visibility with multiple approaches (same as video)
        imagePreview.style.display = 'block';
        imagePreview.classList.add('show');
        
        debugLog(`Show class added, imagePreview.style.display: ${imagePreview.style.display}`);
        debugLog(`Has show class: ${imagePreview.classList.contains('show')}`);
        
        // Add click handler to delete preview when clicked
        // Use mousedown to capture clicks properly (same as video)
        imagePreview.addEventListener('mousedown', (e) => {
            // Only handle left clicks
            if (e.button === 0) {
                e.preventDefault();
                e.stopPropagation();
                clearMediaPreview();
                debugLog('Image preview deleted by clicking on preview');
            }
        });
        
        // Also add a double-click handler as backup
        imagePreview.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            clearMediaPreview();
            debugLog('Image preview deleted by double-clicking on preview');
        });
        
        // Change cursor to indicate it's clickable for deletion
        imagePreview.style.cursor = 'pointer';
        imagePreview.title = 'Click to remove attachment';
        
        // Add visual feedback to input
        messageInput.classList.add('has-media');
        messageInput.focus();
        messageInput.placeholder = '📎 Image ready! Click image to remove, or add caption and press Enter to share.';
        
        debugLog('Image preview shown');
    } else if (file.type.startsWith('video/')) {
        debugLog(`Setting up video preview with URL: ${url}`);
        videoPreview.src = url;
        debugLog(`Video src set, adding show class...`);
        
        // Force visibility with multiple approaches
        videoPreview.style.display = 'block';
        videoPreview.classList.add('show');
        
        debugLog(`Show class added, videoPreview.style.display: ${videoPreview.style.display}`);
        debugLog(`Has show class: ${videoPreview.classList.contains('show')}`);
        
        // Add click handler to delete preview when clicked
        // Use mousedown to capture before video controls
        videoPreview.addEventListener('mousedown', (e) => {
            // Only handle left clicks
            if (e.button === 0) {
                e.preventDefault();
                e.stopPropagation();
                clearMediaPreview();
                debugLog('Video preview deleted by clicking on preview');
            }
        });
        
        // Also add a double-click handler as backup
        videoPreview.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            clearMediaPreview();
            debugLog('Video preview deleted by double-clicking on preview');
        });
        
        // Change cursor to indicate it's clickable for deletion
        videoPreview.style.cursor = 'pointer';
        videoPreview.title = 'Click to remove attachment';
        
        // Add visual feedback to input
        messageInput.classList.add('has-media');
        messageInput.focus();
        messageInput.placeholder = '📎 Video ready! Click video to remove, or add caption and press Enter to share.';
        
        debugLog('Video preview shown');
    } else {
        debugLog(`Unknown file type: ${file.type}`);
    }
}

function addDeleteButton(previewElement) {
    // Ensure the preview element has relative positioning
    previewElement.style.position = 'relative';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '×';
    deleteBtn.className = 'media-delete-button';
    deleteBtn.title = 'Remove media attachment';
    deleteBtn.setAttribute('aria-label', 'Remove media attachment');
    
    // Ensure the button is positioned properly with inline styles
    deleteBtn.style.position = 'absolute';
    deleteBtn.style.top = '-12px';
    deleteBtn.style.right = '-12px';
    deleteBtn.style.backgroundColor = '#e74c3c';
    deleteBtn.style.color = 'white';
    deleteBtn.style.border = '2px solid white';
    deleteBtn.style.borderRadius = '50%';
    deleteBtn.style.width = '24px';
    deleteBtn.style.height = '24px';
    deleteBtn.style.display = 'flex';
    deleteBtn.style.alignItems = 'center';
    deleteBtn.style.justifyContent = 'center';
    deleteBtn.style.fontSize = '16px';
    deleteBtn.style.fontWeight = 'bold';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.3)';
    deleteBtn.style.zIndex = '1000';
    
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        clearMediaPreview();
        debugLog('Media attachment removed by delete button');
    };
    
    // Append button directly to the preview element for proper positioning
    previewElement.appendChild(deleteBtn);
    
    debugLog('Delete button added to media preview with improved styling');
}

function removeExistingDeleteButton() {
    // Remove all media delete buttons to ensure clean state
    const allDeleteButtons = document.querySelectorAll('.media-delete-button');
    
    allDeleteButtons.forEach(btn => {
        btn.remove();
        debugLog('Removed media delete button');
    });
}

function clearMediaPreview() {
    const imagePreview = document.getElementById('mediaPreview');
    const videoPreview = document.getElementById('videoPreview');
    const fileInput = document.getElementById('fileInput');
    
    debugLog('Clearing media preview...');
    
    // Clear image preview
    imagePreview.classList.remove('show');
    imagePreview.style.display = 'none';
    
    // Clear video preview - need extra steps for video
    videoPreview.classList.remove('show');
    videoPreview.style.display = 'none';
    videoPreview.pause(); // Stop any playing video
    videoPreview.currentTime = 0; // Reset to beginning
    
    // Clear file input
    fileInput.value = '';
    selectedFile = null;
    
    // Remove delete button
    removeExistingDeleteButton();
    
    // Remove visual feedback and reset placeholder
    messageInput.classList.remove('has-media');
    messageInput.placeholder = 'Type your message...';
    
    // Revoke object URLs to prevent memory leaks
    if (imagePreview.src && imagePreview.src.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview.src);
        imagePreview.src = '';
    }
    if (videoPreview.src && videoPreview.src.startsWith('blob:')) {
        URL.revokeObjectURL(videoPreview.src);
        videoPreview.src = '';
    }
    
    // Remove any event listeners
    videoPreview.onmousedown = null;
    videoPreview.ondblclick = null;
    imagePreview.onmousedown = null;
    imagePreview.ondblclick = null;
    imagePreview.onclick = null;
    
    debugLog('Media preview cleared and placeholder reset');
}

function uploadFile(file) {
    return new Promise((resolve, reject) => {
        debugLog(`Starting upload for file: ${file.name} (${file.size} bytes, ${file.type})`);
        
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        
        // Show upload progress
        const progressDiv = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('uploadProgressFill');
        const progressPercent = document.getElementById('uploadPercent');
        const uploadText = document.getElementById('uploadText');
        
        progressDiv.classList.add('show');
        progressFill.style.width = '0%';
        progressPercent.textContent = '0%';
        uploadText.textContent = 'Uploading';

        xhr.upload.onprogress = function(e) {
            if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                progressFill.style.width = `${percentComplete}%`;
                progressPercent.textContent = `${percentComplete}%`;
                
                if (percentComplete === 100) {
                    uploadText.textContent = 'Processing';
                }
            }
        };

        xhr.onload = function() {
            progressDiv.classList.remove('show');
            
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        resolve(response);
                    } else {
                        debugLog(`Upload failed - Server response: ${JSON.stringify(response)}`);
                        reject(new Error(response.error || 'Upload failed'));
                    }
                } catch (e) {
                    debugLog(`Upload failed - Invalid response: ${xhr.responseText}`);
                    reject(new Error('Invalid response from server'));
                }
            } else {
                debugLog(`Upload failed - HTTP ${xhr.status}: ${xhr.responseText}`);
                reject(new Error(`Upload failed with status ${xhr.status}`));
            }
        };

        xhr.onerror = function() {
            progressDiv.classList.remove('show');
            debugLog(`Upload network error occurred`);
            reject(new Error('Network error during upload'));
        };

        xhr.open('POST', '/upload');
        xhr.send(formData);
    });
}

function sendMediaMessage() {
    if (!selectedFile || isUploading) {
        return;
    }

    // Check WebSocket state
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Connection lost. Please refresh and try again.');
        return;
    }

    isUploading = true;
    const sendBtn = document.getElementById('sendBtn');
    sendBtn.disabled = true;
    sendBtn.classList.add('loading');
    sendBtn.textContent = 'Send';

    uploadFile(selectedFile)
        .then(response => {
            debugLog(`File uploaded successfully: ${JSON.stringify(response)}`);
            
            // Get optional text to send with media
            const text = messageInput.value.trim();
            
            // Send media message via WebSocket (with optional text)
            const mediaMessage = {
                type: 'media',
                mediaUrl: response.fileUrl,
                mediaType: response.fileType,
                fileName: response.fileName,
                text: text // Include text if provided
            };
            
            // Add reply information if replying to a message
            if (currentReply) {
                mediaMessage.replyTo = {
                    id: currentReply.id,
                    sender: currentReply.sender,
                    text: currentReply.text
                };
                debugLog(`Including reply to message ${currentReply.id} in media message`);
            }

            debugLog(`Sending media message: ${JSON.stringify(mediaMessage)}`);
            ws.send(JSON.stringify(mediaMessage));
            
            // Clear preview, reset form, and clear text input
            clearMediaPreview();
            messageInput.value = '';
            
            // Clear reply state after sending
            if (currentReply) {
                cancelReply();
            }
            
            // Enhanced scroll handling for sent media messages
            isUserScrolledUp = false; // Reset scroll state
            // Multiple scroll attempts with increasing delays to handle media loading
            setTimeout(() => scrollToBottom(), 50);
            setTimeout(() => scrollToBottom(), 200);
            setTimeout(() => scrollToBottom(), 500);
            setTimeout(() => scrollToBottom(), 1000);
            
            debugLog('Media message sent successfully with enhanced scrolling');
        })
        .catch(error => {
            debugLog(`Error uploading file: ${error}`);
            alert(`Failed to upload file: ${error.message}`);
        })
        .finally(() => {
            isUploading = false;
            sendBtn.disabled = false;
            sendBtn.classList.remove('loading');
            sendBtn.textContent = 'Send';
        });
}

function openImageModal(imageSrc) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    modal.style.display = 'block';
    modalImg.src = imageSrc;
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    modal.style.display = 'none';
}

// Message deletion functions
function deleteMessage(messageId) {
    debugLog(`Attempting to delete message: ${messageId}`);
    
    // Confirm deletion
    if (!confirm('Are you sure you want to delete this message?')) {
        return;
    }
    
    // Check WebSocket state
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Connection lost. Please refresh and try again.');
        return;
    }

    const deleteRequest = {
        type: 'delete',
        messageId: messageId
    };

    debugLog(`Sending delete request: ${JSON.stringify(deleteRequest)}`);
    try {
        ws.send(JSON.stringify(deleteRequest));
        debugLog('Delete request sent successfully');
    } catch (error) {
        debugLog(`Error sending delete request: ${error}`);
        alert('Failed to delete message. Please try again.');
    }
}

function handleMessageDeletion(messageId) {
    debugLog(`Handling message deletion for ID: ${messageId}`);
    
    // Find and remove the message element from the UI using data attribute
    const messageEl = messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
        // Add deletion animation class
        messageEl.classList.add('deleting');
        
        // Remove the element after animation completes
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
            debugLog(`Message ${messageId} removed from UI`);
        }, 500); // Match animation duration
    } else {
        debugLog(`Message element with ID ${messageId} not found in UI`);
    }
}

// Reply functionality
let currentReply = null;

function replyToMessage(messageId, sender, text) {
    debugLog(`Setting up reply to message ${messageId} from ${sender}`);
    
    currentReply = {
        id: messageId,
        sender: sender,
        text: text
    };
    
    // Show reply preview
    const replyPreview = document.getElementById('replyPreview');
    const replySender = document.getElementById('replySender');
    const replyPreviewMessage = document.getElementById('replyPreviewMessage');
    
    if (replyPreview && replySender && replyPreviewMessage) {
        replySender.textContent = sender;
        replyPreviewMessage.textContent = text.length > 100 ? text.substring(0, 100) + '...' : text;
        replyPreview.style.display = 'block';
        
        // Focus the message input
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.focus();
        }
    }
}

function cancelReply() {
    debugLog('Cancelling reply');
    
    currentReply = null;
    const replyPreview = document.getElementById('replyPreview');
    if (replyPreview) {
        replyPreview.style.display = 'none';
    }
}

function scrollToMessage(messageId) {
    debugLog(`Scrolling to message ${messageId}`);
    
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });
        
        // Highlight the message briefly
        messageElement.style.backgroundColor = 'rgba(99, 102, 241, 0.2)';
        setTimeout(() => {
            messageElement.style.backgroundColor = '';
        }, 2000);
    }
}

// Load active rooms every 5 seconds
setInterval(loadActiveRooms, 5000); // i will change it based on user feedback

// ===== REACTION FUNCTIONS =====

// Create reactions HTML from reactions array
function createReactionsHtml(reactions, messageId) {
    if (!reactions || reactions.length === 0) {
        return '';
    }

    let reactionsHtml = '<div class="message-reactions">';
    reactions.forEach(reaction => {
        const isUserReaction = currentUser && reaction.userID && reaction.userID.includes(currentUser.id);
        const userList = reaction.users ? reaction.users.join(', ') : '';
        
        reactionsHtml += `
            <button class="reaction-btn ${isUserReaction ? 'user-reacted' : ''}" 
                    onclick="toggleReaction('${escapeHtml(messageId)}', '${escapeHtml(reaction.emoji)}')"
                    title="${escapeHtml(userList)} reacted with ${escapeHtml(reaction.emoji)}">
                <span class="reaction-emoji">${escapeHtml(reaction.emoji)}</span>
                <span class="reaction-count">${reaction.count}</span>
            </button>
        `;
    });
    reactionsHtml += '</div>';
    
    return reactionsHtml;
}

// Popular emojis for quick access
const popularEmojis = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥', '👏', '💯'];

// Toggle emoji picker
function toggleEmojiPicker(messageId) {
    console.log('toggleEmojiPicker called for messageId:', messageId); // Debug
    
    // Remove any existing emoji picker
    const existingPicker = document.querySelector('.emoji-picker');
    if (existingPicker) {
        existingPicker.remove();
    }

    // Find the message element
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) {
        console.error('Message element not found for ID:', messageId);
        return;
    }

    // Create emoji picker
    const emojiPicker = document.createElement('div');
    emojiPicker.className = 'emoji-picker';
    emojiPicker.innerHTML = `
        <div class="emoji-picker-content">
            <div class="emoji-picker-header">Add Reaction</div>
            <div class="emoji-grid">
                ${popularEmojis.map(emoji => 
                    `<button class="emoji-option" onclick="addReaction('${escapeHtml(messageId)}', '${emoji}'); closeEmojiPicker()">${emoji}</button>`
                ).join('')}
            </div>
            <button class="emoji-picker-close" onclick="closeEmojiPicker()">×</button>
        </div>
    `;

    // Position the picker
    const emojiBtn = messageElement.querySelector('.message-emoji-btn');
    if (emojiBtn) {
        const rect = emojiBtn.getBoundingClientRect();
        emojiPicker.style.position = 'fixed';
        emojiPicker.style.top = `${rect.bottom + 5}px`;
        emojiPicker.style.left = `${rect.left - 100}px`; // Center it roughly
        emojiPicker.style.zIndex = '1000';
    }

    document.body.appendChild(emojiPicker);

    // Close picker when clicking outside
    setTimeout(() => {
        document.addEventListener('click', closeEmojiPickerOnOutsideClick);
    }, 100);
}

// Close emoji picker
function closeEmojiPicker() {
    const picker = document.querySelector('.emoji-picker');
    if (picker) {
        picker.remove();
    }
    document.removeEventListener('click', closeEmojiPickerOnOutsideClick);
}

// Close emoji picker when clicking outside
function closeEmojiPickerOnOutsideClick(event) {
    const picker = document.querySelector('.emoji-picker');
    const emojiBtn = event.target.closest('.message-emoji-btn');
    
    if (picker && !picker.contains(event.target) && !emojiBtn) {
        closeEmojiPicker();
    }
}

// Add reaction to a message
function addReaction(messageId, emoji) {
    console.log('addReaction called:', { messageId, emoji, wsConnected: !!ws, isConnected }); // Debug
    
    if (!ws || !isConnected) {
        console.error('WebSocket not connected');
        return;
    }

    const reactionData = {
        type: 'reaction',
        messageId: messageId,
        emoji: emoji,
        action: 'toggle' // Toggle will add if not exists, remove if exists
    };

    console.log('Sending reaction data:', reactionData); // Debug
    ws.send(JSON.stringify(reactionData));
    debugLog(`Sent reaction: ${emoji} for message ${messageId}`);
}

// Toggle reaction (same as add, but explicit function name)
function toggleReaction(messageId, emoji) {
    addReaction(messageId, emoji);
}

// Update message with new reaction data
function updateMessageReactions(messageData) {
    const messageElement = document.querySelector(`[data-message-id="${messageData.id}"]`);
    if (!messageElement) {
        console.error('Message element not found for reaction update:', messageData.id);
        return;
    }

    // Find and update the reactions container
    const reactionsContainer = messageElement.querySelector('.message-reactions');
    const newReactionsHtml = createReactionsHtml(messageData.reactions || [], messageData.id);
    
    if (reactionsContainer) {
        // Replace existing reactions
        if (newReactionsHtml) {
            reactionsContainer.outerHTML = newReactionsHtml;
        } else {
            reactionsContainer.remove();
        }
    } else {
        // Add new reactions if none existed
        if (newReactionsHtml) {
            const messageContent = messageElement.querySelector('.message-content');
            if (messageContent) {
                messageContent.insertAdjacentHTML('beforeend', newReactionsHtml);
            }
        }
    }

    debugLog(`Updated reactions for message ${messageData.id}`);
}

// Initialize debug log
debugLog('Chat application initialized');

// Check authentication on page load
window.addEventListener('load', () => {
    console.log('=== PAGE LOADED - STARTING INITIALIZATION ===');
    checkRequiredElements();
    debugLog('Page loaded, checking authentication...');
    checkAuth().then(authenticated => {
        if (authenticated) {
            debugLog('User is authenticated');
            // Check if user was redirected after auth
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('authenticated') === 'true') {
                debugLog('User just completed authentication');
                // Clear the URL parameters
                window.history.replaceState({}, document.title, window.location.pathname);
            }
            
            // Attempt to restore saved room after authentication
            //restoreSavedRoom();
            
            // Load active rooms after authentication is confirmed
            loadActiveRooms();
        } else {
            debugLog('User not authenticated');
            // Clear any saved room if not authenticated
            localStorage.removeItem('currentRoom');
            // Still load rooms to show the "Login to see active rooms" message
            loadActiveRooms();
        }
    });
});

// Private Room Creation functionality
let selectedUsers = new Map(); // Map of user email -> user object

// Initialize private room modal functionality
document.addEventListener('DOMContentLoaded', function() {
    const createPrivateRoomBtn = document.getElementById('createPrivateRoomBtn');
    const userSearchInput = document.getElementById('userSearch');
    
    if (createPrivateRoomBtn) {
        createPrivateRoomBtn.addEventListener('click', openPrivateRoomModal);
    }
    
    if (userSearchInput) {
        userSearchInput.addEventListener('input', debounce(searchUsers, 300));
        userSearchInput.addEventListener('focus', function() {
            if (this.value.trim()) {
                searchUsers();
            }
        });
        
        // Hide search results when clicking outside
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.user-search-container')) {
                hideSearchResults();
            }
        });
    }
});

function openPrivateRoomModal() {
    const modal = document.getElementById('privateRoomModal');
    if (modal) {
        modal.style.display = 'flex';
        // Clear previous data
        clearPrivateRoomForm();
        // Focus on room name input
        setTimeout(() => {
            const roomNameInput = document.getElementById('privateRoomName');
            if (roomNameInput) {
                roomNameInput.focus();
            }
        }, 100);
    }
}

function closePrivateRoomModal() {
    const modal = document.getElementById('privateRoomModal');
    if (modal) {
        modal.style.display = 'none';
        clearPrivateRoomForm();
    }
}

function clearPrivateRoomForm() {
    const roomNameInput = document.getElementById('privateRoomName');
    const descriptionInput = document.getElementById('privateRoomDescription');
    const userSearchInput = document.getElementById('userSearch');
    
    if (roomNameInput) roomNameInput.value = '';
    if (descriptionInput) descriptionInput.value = '';
    if (userSearchInput) userSearchInput.value = '';
    
    selectedUsers.clear();
    updateSelectedUsersList();
    hideSearchResults();
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function searchUsers() {
    const query = document.getElementById('userSearch').value.trim();
    if (query.length < 2) {
        hideSearchResults();
        return;
    }
    
    debugLog(`Searching for users: ${query}`);
    
    fetch(`/api/users/search?q=${encodeURIComponent(query)}&limit=50`)
        .then(response => {
            if (response.status === 401) {
                debugLog('Unauthorized - redirecting to login');
                isAuthenticated = false;
                updateAuthUI();
                return null;
            }
            return response.json();
        })
        .then(data => {
            if (!data) return;
            displaySearchResults(data.users || []);
        })
        .catch(error => {
            debugLog(`Error searching users: ${error}`);
            hideSearchResults();
        });
}

function displaySearchResults(users) {
    const resultsContainer = document.getElementById('userSearchResults');
    if (!resultsContainer) return;
    
    if (users.length === 0) {
        resultsContainer.innerHTML = '<div class="search-result-item">No users found</div>';
        resultsContainer.classList.add('show');
        return;
    }
    
    resultsContainer.innerHTML = '';
    
    users.forEach(user => {
        // Skip if user is already selected
        if (selectedUsers.has(user.email)) return;
        
        // Skip current user - they'll be automatically added as room creator
        if (currentUser && user.email === currentUser.email) return;
        
        const resultItem = document.createElement('div');
        resultItem.className = 'search-result-item';
        resultItem.onclick = () => selectUser(user);
        
        const avatar = document.createElement('div');
        avatar.className = 'search-result-avatar';
        if (user.avatar) {
            avatar.style.backgroundImage = `url(${user.avatar})`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
        } else {
            avatar.textContent = user.name.charAt(0).toUpperCase();
        }
        
        const info = document.createElement('div');
        info.className = 'search-result-info';
        
        const name = document.createElement('div');
        name.className = 'search-result-name';
        name.textContent = user.name;
        
        const email = document.createElement('div');
        email.className = 'search-result-email';
        email.textContent = user.email;
        
        info.appendChild(name);
        info.appendChild(email);
        
        resultItem.appendChild(avatar);
        resultItem.appendChild(info);
        
        resultsContainer.appendChild(resultItem);
    });
    
    resultsContainer.classList.add('show');
}

function hideSearchResults() {
    const resultsContainer = document.getElementById('userSearchResults');
    if (resultsContainer) {
        resultsContainer.classList.remove('show');
    }
}

function selectUser(user) {
    selectedUsers.set(user.email, user);
    updateSelectedUsersList();
    
    // Clear search input and hide results
    const searchInput = document.getElementById('userSearch');
    if (searchInput) {
        searchInput.value = '';
    }
    hideSearchResults();
    
    debugLog(`Selected user: ${user.name} (${user.email})`);
}

function removeUser(email) {
    selectedUsers.delete(email);
    updateSelectedUsersList();
    debugLog(`Removed user: ${email}`);
}

function updateSelectedUsersList() {
    const container = document.getElementById('selectedUsersList');
    if (!container) return;
    
    if (selectedUsers.size === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-style: italic;">No users selected</div>';
        return;
    }
    
    container.innerHTML = '';
    
    selectedUsers.forEach((user, email) => {
        const userTag = document.createElement('div');
        userTag.className = 'selected-user-tag';
        
        const avatar = document.createElement('div');
        avatar.className = 'selected-user-avatar';
        if (user.avatar) {
            avatar.style.backgroundImage = `url(${user.avatar})`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
        } else {
            avatar.textContent = user.name.charAt(0).toUpperCase();
        }
        
        const name = document.createElement('span');
        name.textContent = user.name;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'selected-user-remove';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = () => removeUser(email);
        removeBtn.title = 'Remove user';
        
        userTag.appendChild(avatar);
        userTag.appendChild(name);
        userTag.appendChild(removeBtn);
        
        container.appendChild(userTag);
    });
}

function createPrivateRoom() {
    const roomName = document.getElementById('privateRoomName').value.trim();
    const description = document.getElementById('privateRoomDescription').value.trim();
    
    if (!roomName) {
        alert('Please enter a room name');
        return;
    }
    
    if (roomName.length < 3 || roomName.length > 50) {
        alert('Room name must be between 3 and 50 characters');
        return;
    }
    
    if (selectedUsers.size === 0) {
        alert('Please select at least one user to invite');
        return;
    }
    
    const createBtn = document.getElementById('createRoomBtn');
    if (createBtn) {
        createBtn.disabled = true;
        createBtn.textContent = 'Creating...';
    }
    
    const userEmails = Array.from(selectedUsers.keys());
    
    const requestData = {
        room_name: roomName,
        description: description,
        user_emails: userEmails
    };
    
    debugLog(`Creating private room: ${JSON.stringify(requestData)}`);
    
    fetch('/api/rooms/private', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
    })
    .then(response => {
        if (response.status === 401) {
            debugLog('Unauthorized - redirecting to login');
            isAuthenticated = false;
            updateAuthUI();
            return null;
        }
        return response.json();
    })
    .then(data => {
        if (createBtn) {
            createBtn.disabled = false;
            createBtn.textContent = 'Create Room';
        }
        
        if (!data) return;
        
        if (data.error) {
            if (data.missing_emails) {
                alert(`Some users were not found: ${data.missing_emails.join(', ')}`);
            } else {
                alert(`Error: ${data.error}`);
            }
            return;
        }
        
        if (data.room) {
            debugLog(`Private room created successfully: ${data.room.name}`);
            closePrivateRoomModal();
            
            // Refresh the rooms list
            loadActiveRooms();
            
            // Automatically join the newly created room
            setTimeout(() => {
                joinRoomByName(data.room.name);
            }, 500);
        }
    })
    .catch(error => {
        debugLog(`Error creating private room: ${error}`);
        alert('Failed to create private room. Please try again.');
        
        if (createBtn) {
            createBtn.disabled = false;
            createBtn.textContent = 'Create Room';
        }
    });
}

// Close modal when clicking outside of it
window.onclick = function(event) {
    const modal = document.getElementById('privateRoomModal');
    if (event.target === modal) {
        closePrivateRoomModal();
    }
}

// Close modal on Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const modal = document.getElementById('privateRoomModal');
        if (modal && modal.style.display === 'flex') {
            closePrivateRoomModal();
        }
    }
});
