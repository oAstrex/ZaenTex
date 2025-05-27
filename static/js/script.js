document.addEventListener('DOMContentLoaded', () => {
    // Load theme preference
    const savedTheme = localStorage.getItem('chatTheme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    // Load reasoning toggle preference
    const savedShowReasoning = localStorage.getItem('showReasoning') === 'true';
    
    // Settings modal elements
    const openSettingsBtn = document.getElementById('open-settings');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings');
    const cancelSettingsBtn = document.getElementById('cancel-settings');
    const saveSettingsBtn = document.getElementById('save-settings');
    const themeOptions = document.querySelectorAll('.theme-option');
    const reasoningToggle = document.getElementById('reasoning-toggle');
    const modelSelect = document.getElementById('model-select');
    
    // Initialize reasoning toggle from saved preference
    reasoningToggle.checked = savedShowReasoning;
    
    // Store initial settings for cancel operation
    let initialSettings = {
        theme: savedTheme,
        showReasoning: savedShowReasoning,
        model: modelSelect.value
    };
    
    // Open settings modal
    openSettingsBtn.addEventListener('click', () => {
        // Store current settings in case user cancels
        initialSettings = {
            theme: document.documentElement.getAttribute('data-theme'),
            showReasoning: reasoningToggle.checked,
            model: modelSelect.value
        };
        
        // Set active theme in the modal
        const currentTheme = document.documentElement.getAttribute('data-theme');
        themeOptions.forEach(option => {
            if (option.dataset.theme === currentTheme) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
        
        settingsModal.classList.add('active');
    });
    
    // Close settings modal without saving
    function closeModal() {
        settingsModal.classList.remove('active');
    }
    
    closeSettingsBtn.addEventListener('click', closeModal);
    
    // Cancel settings changes
    cancelSettingsBtn.addEventListener('click', () => {
        // Restore initial settings
        document.documentElement.setAttribute('data-theme', initialSettings.theme);
        reasoningToggle.checked = initialSettings.showReasoning;
        modelSelect.value = initialSettings.model;
        closeModal();
    });
    
    // Handle theme selection
    themeOptions.forEach(option => {
        option.addEventListener('click', () => {
            themeOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            
            // Preview the theme immediately
            document.documentElement.setAttribute('data-theme', option.dataset.theme);
        });
    });
    
    // Save settings
    saveSettingsBtn.addEventListener('click', () => {
        // Save theme
        const selectedTheme = document.querySelector('.theme-option.active').dataset.theme;
        document.documentElement.setAttribute('data-theme', selectedTheme);
        localStorage.setItem('chatTheme', selectedTheme);
        
        // Save reasoning toggle state
        localStorage.setItem('showReasoning', reasoningToggle.checked);
        
        // No need to save model selection as it's used directly when sending messages
        
        // Close modal
        closeModal();
    });
    
    // Check if required libraries are loaded
    const isMarkedLoaded = typeof marked !== 'undefined';
    const isHljsLoaded = typeof hljs !== 'undefined';
    
    if (!isMarkedLoaded) {
        console.error('Warning: Marked library not loaded. Markdown rendering will be disabled.');
    }
    
    if (!isHljsLoaded) {
        console.error('Warning: Highlight.js library not loaded. Syntax highlighting will be disabled.');
    }
    
    // Configure marked options if available
    if (isMarkedLoaded) {
        marked.setOptions({
            highlight: function(code, language) {
                if (isHljsLoaded && language && hljs.getLanguage(language)) {
                    return hljs.highlight(code, { language }).value;
                }
                return code;
            },
            breaks: true,
            gfm: true
        });
    }
    
    // Elements
    const chatList = document.getElementById('chat-list');
    const messageForm = document.getElementById('message-form');
    const userInput = document.getElementById('user-input');
    const messagesContainer = document.getElementById('messages');
    const newChatButton = document.getElementById('new-chat');
    const currentChatName = document.getElementById('current-chat-name');
    
    // State
    let chats = [];
    let currentChatId = null;
    let activeEventSource = null;
    
    // Debug indicator
    const debugIndicator = document.createElement('div');
    debugIndicator.style.position = 'fixed';
    debugIndicator.style.top = '10px';
    debugIndicator.style.right = '10px';
    debugIndicator.style.padding = '5px 10px';
    debugIndicator.style.background = '#f0f0f0';
    debugIndicator.style.border = '1px solid #ccc';
    debugIndicator.style.borderRadius = '3px';
    debugIndicator.style.fontSize = '12px';
    debugIndicator.textContent = 'Debug: Ready';
    document.body.appendChild(debugIndicator);

    function debugLog(message) {
        console.log(`[DEBUG] ${message}`);
        debugIndicator.textContent = `Debug: ${message}`;
    }
    
    // Initialize app
    initializeChat();

    // Auto-resize textarea as user types
    userInput.addEventListener('input', () => {
        userInput.style.height = 'auto';
        userInput.style.height = userInput.scrollHeight + 'px';
        
        // Reset height if empty
        if (userInput.value === '') {
            userInput.style.height = '';
        }
    });

    // Handle Enter key press to send message and Shift+Enter for new line
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Prevent default enter behavior (new line)
            const message = userInput.value.trim();
            if (message) {
                sendMessage(message);
                userInput.value = '';
                userInput.style.height = '';
            }
        }
    });

    // Handle message submission
    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const message = userInput.value.trim();
        if (!message) return;
        
        debugLog('Sending message...');
        sendMessage(message);
        
        userInput.value = '';
        userInput.style.height = '';
        userInput.focus();
    });

    // Create a new chat
    newChatButton.addEventListener('click', () => {
        createNewChat();
    });

    function initializeChat() {
        debugLog('Initializing chat');
        // Load chats from localStorage
        const savedChats = localStorage.getItem('chutesChats');
        if (savedChats) {
            chats = JSON.parse(savedChats);
            renderChatList();
            
            // Load the most recent chat
            if (chats.length > 0) {
                loadChat(chats[0].id);
            } else {
                createNewChat();
            }
        } else {
            createNewChat();
        }
    }
    
    function createNewChat() {
        debugLog('Creating new chat');
        const chatId = Date.now();
        const newChat = {
            id: chatId,
            title: 'New Chat',
            messages: [],
            model: modelSelect.value,
            showReasoning: reasoningToggle.checked
        };
        
        // Add to the beginning of the array
        chats.unshift(newChat);
        
        // Update UI
        renderChatList();
        loadChat(chatId);
        saveChats();
        
        // Clear messages
        messagesContainer.innerHTML = `
            <div class="welcome-message">
                <h2>New Chat Started</h2>
                <p>Selected Model: ${modelSelect.value.split('/').pop()}</p>
            </div>
        `;
        
        return chatId;
    }
    
    // Generate a title from user's message
    function generateChatTitle(message) {
        // Remove code blocks and markdown formatting
        let cleanMessage = message.replace(/```[\s\S]*?```/g, '')
                                 .replace(/`([^`]+)`/g, '$1')
                                 .replace(/\*\*([^*]+)\*\*/g, '$1')
                                 .replace(/\*([^*]+)\*/g, '$1')
                                 .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
        
        // Split into words
        let words = cleanMessage.split(/\s+/);
        
        // Take first 4-6 words depending on length
        let titleWords = words.slice(0, words.length > 10 ? 4 : 6);
        let title = titleWords.join(' ');
        
        // Truncate if still too long
        if (title.length > 40) {
            title = title.substring(0, 37) + '...';
        }
        
        // Capitalize first letter of each word for title case
        title = title.replace(/\b\w/g, c => c.toUpperCase());
        
        return title;
    }
    
    function renderChatList() {
        chatList.innerHTML = '';
        
        chats.forEach(chat => {
            const chatItem = document.createElement('div');
            chatItem.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
            chatItem.dataset.id = chat.id;
            
            chatItem.innerHTML = `
                <div class="chat-item-title">${chat.title}</div>
                <button class="delete-chat" data-id="${chat.id}">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            
            chatItem.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-chat')) {
                    loadChat(chat.id);
                }
            });
            
            chatList.appendChild(chatItem);
        });
        
        // Add event listeners to delete buttons
        document.querySelectorAll('.delete-chat').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteChat(button.dataset.id);
            });
        });
    }
    
    function loadChat(chatId) {
        debugLog(`Loading chat ${chatId}`);
        currentChatId = parseInt(chatId);
        const chat = chats.find(c => c.id === currentChatId);
        
        if (!chat) return;
        
        // Update UI
        currentChatName.textContent = chat.title;
        modelSelect.value = chat.model;
        reasoningToggle.checked = chat.showReasoning;
        
        // Re-render chat list to update active state
        renderChatList();
        
        // Render messages
        renderMessages(chat.messages);
    }
    
    function deleteChat(chatId) {
        chatId = parseInt(chatId);
        
        // Filter out the chat
        chats = chats.filter(c => c.id !== chatId);
        saveChats();
        
        // Update UI
        renderChatList();
        
        // If we deleted the current chat, load another one or create new
        if (chatId === currentChatId) {
            if (chats.length > 0) {
                loadChat(chats[0].id);
            } else {
                createNewChat();
            }
        }
    }
    
    function renderMessages(messages) {
        messagesContainer.innerHTML = '';
        
        if (messages.length === 0) {
            messagesContainer.innerHTML = `
                <div class="welcome-message">
                    <h2>Welcome to ZaenTex</h2>
                    <p>Choose a model from settings and start chatting!</p>
                </div>
            `;
            return;
        }
        
        messages.forEach(message => {
            const messageElement = createMessageElement(message);
            messagesContainer.appendChild(messageElement);
        });
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    function createMessageElement(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.sender === 'user' ? 'user-message' : 'assistant-message'}`;
        
        let content = message.content;
        
        // Handle think blocks if reasoning is enabled
        if (message.sender === 'assistant') {
            if (reasoningToggle.checked) {
                // Format think blocks first
                let thinkBlocks = [];
                content = content.replace(/<think>([\s\S]*?)<\/think>/g, (match, thinking) => {
                    thinkBlocks.push(thinking);
                    return `<think-placeholder-${thinkBlocks.length - 1}/>`;
                });
                
                // Apply markdown if available
                if (isMarkedLoaded) {
                    content = marked.parse(content);
                    
                    // Put think blocks back
                    thinkBlocks.forEach((block, i) => {
                        const thinkContent = isMarkedLoaded ? marked.parse(block) : block;
                        content = content.replace(
                            new RegExp(`<p><think-placeholder-${i}/></p>`, 'g'),
                            `<div class="think-block">${thinkContent}</div>`
                        );
                    });
                } else {
                    // Just put the think blocks back directly
                    thinkBlocks.forEach((block, i) => {
                        content = content.replace(
                            `<think-placeholder-${i}/>`, 
                            `<div class="think-block">${block}</div>`
                        );
                    });
                }
            } else {
                // Remove <think> blocks if reasoning is disabled
                content = content.replace(/<think>[\s\S]*?<\/think>/g, '');
                // Apply markdown if available
                if (isMarkedLoaded) {
                    content = marked.parse(content);
                }
            }
        } else if (isMarkedLoaded) {
            // For user messages, just render markdown if available
            content = marked.parse(content);
        }
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <strong>${message.sender === 'user' ? 'You' : 'Assistant'}</strong>
            </div>
            <div class="message-content">${content}</div>
        `;
        
        // Apply syntax highlighting to code blocks if both libraries are loaded
        if (isMarkedLoaded && isHljsLoaded) {
            messageDiv.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        }
        
        return messageDiv;
    }
    
    function sendMessage(message) {
        if (!currentChatId) {
            currentChatId = createNewChat();
        }
        
        const chat = chats.find(c => c.id === currentChatId);
        if (!chat) return;
        
        // Add user message to chat
        const userMessage = {
            sender: 'user',
            content: message,
            timestamp: Date.now()
        };
        
        chat.messages.push(userMessage);
        
        // Update the chat title if it's the first message
        if (chat.messages.length === 1) {
            // Generate a title from the user's message
            const title = generateChatTitle(message);
            chat.title = title;
            currentChatName.textContent = title;
            renderChatList();
        }
        
        // Render the message
        renderMessages(chat.messages);
        
        // Save the updated chat
        saveChats();
        
        // Create a placeholder for the assistant's response
        const assistantPlaceholder = document.createElement('div');
        assistantPlaceholder.className = 'message assistant-message';
        assistantPlaceholder.innerHTML = `
            <div class="message-header">
                <strong>Assistant</strong>
            </div>
            <div class="message-content">
                <div class="spinner"></div>
            </div>
        `;
        
        messagesContainer.appendChild(assistantPlaceholder);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Send request to backend
        const selectedModel = modelSelect.value;
        const showReasoning = reasoningToggle.checked;
        
        // Update chat model and reasoning preference
        chat.model = selectedModel;
        chat.showReasoning = showReasoning;
        saveChats();
        
        // Close any existing EventSource
        if (activeEventSource) {
            activeEventSource.close();
            activeEventSource = null;
        }
        
        // Create eventsource for streaming response
        fetchChatResponse(message, chat.messages, selectedModel, showReasoning)
            .then(response => {
                // Update the assistant message with the response
                const assistantMessage = {
                    sender: 'assistant',
                    content: response,
                    timestamp: Date.now()
                };
                
                chat.messages.push(assistantMessage);
                saveChats();
                
                // Instead of re-rendering all messages, just update the placeholder
                // This prevents the message duplication issue
                if (assistantPlaceholder && assistantPlaceholder.parentNode === messagesContainer) {
                    // Just leave the placeholder as-is since it's already showing the final content
                } else {
                    // If something went wrong with the placeholder, render all messages
                    renderMessages(chat.messages);
                }
            })
            .catch(error => {
                console.error('Error:', error);
                
                // Show error message
                const assistantMessage = {
                    sender: 'assistant',
                    content: `Error: ${error.message}`,
                    timestamp: Date.now()
                };
                
                chat.messages.push(assistantMessage);
                saveChats();
                
                // Update the placeholder with the error message
                const contentDiv = assistantPlaceholder.querySelector('.message-content');
                if (contentDiv) {
                    contentDiv.innerHTML = `Error: ${error.message}`;
                } else {
                    renderMessages(chat.messages);
                }
            });
    }
    
    function fetchChatResponse(message, history, model, showReasoning) {
        return new Promise((resolve, reject) => {
            // Close any existing EventSource
            if (activeEventSource) {
                activeEventSource.close();
                activeEventSource = null;
            }
            
            // Make the API request using simple fetch with streaming response
            fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    model: model,
                    history: history.filter(m => m.sender !== 'system'),
                    showReasoning: showReasoning
                })
            })
            .then(response => {
                debugLog('Got initial response from server');
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                // Get a reader from the response body
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let fullResponse = '';
                
                // Get the most recent assistant message (the placeholder we just added)
                const assistantContent = messagesContainer.querySelector('.message.assistant-message:last-child .message-content');
                
                function processResult(result) {
                    if (result.done) {
                        debugLog('Stream complete');
                        
                        // Make sure we have final content
                        if (fullResponse) {
                            resolve(fullResponse);
                        } else {
                            resolve('No response received');
                        }
                        return;
                    }
                    
                    // Get the chunk of data
                    const chunk = decoder.decode(result.value, { stream: true });
                    buffer += chunk;
                    
                    // Process each complete data: line
                    let lines = buffer.split('\n\n');
                    buffer = lines.pop() || ''; // Keep the last incomplete chunk in buffer
                    
                    lines.forEach(line => {
                        if (line.startsWith('data: ')) {
                            const data = line.substring(6);
                            try {
                                const parsedData = JSON.parse(data);
                                debugLog(`Received data chunk`);
                                
                                if (parsedData.error) {
                                    debugLog(`Error: ${parsedData.error}`);
                                    reject(new Error(parsedData.error));
                                    return;
                                }
                                
                                if (parsedData.done === true) {
                                    debugLog('Received done message');
                                    if (parsedData.fullResponse) {
                                        fullResponse = parsedData.fullResponse;
                                    }
                                    return;
                                }
                                
                                if (parsedData.delta) {
                                    fullResponse += parsedData.delta;
                                    
                                    // Update the assistant message in real-time
                                    if (assistantContent) {
                                        let displayContent = fullResponse;
                                        let tempContent = displayContent;
                                        
                                        // Handle think blocks and markdown
                                        if (showReasoning) {
                                            // Format think blocks
                                            const thinkBlocks = [];
                                            tempContent = displayContent.replace(/<think>([\s\S]*?)<\/think>/g, (match, thinking) => {
                                                thinkBlocks.push(thinking);
                                                return `<think-placeholder-${thinkBlocks.length - 1}/>`;
                                            });
                                            
                                            // Apply markdown if available
                                            if (isMarkedLoaded) {
                                                tempContent = marked.parse(tempContent);
                                                
                                                // Put think blocks back
                                                thinkBlocks.forEach((block, i) => {
                                                    const thinkContent = isMarkedLoaded ? marked.parse(block) : block;
                                                    tempContent = tempContent.replace(
                                                        new RegExp(`<p><think-placeholder-${i}/></p>`, 'g'),
                                                        `<div class="think-block">${thinkContent}</div>`
                                                    );
                                                });
                                            } else {
                                                // Just put the think blocks back directly
                                                thinkBlocks.forEach((block, i) => {
                                                    tempContent = tempContent.replace(
                                                        `<think-placeholder-${i}/>`, 
                                                        `<div class="think-block">${block}</div>`
                                                    );
                                                });
                                            }
                                        } else {
                                            // Remove <think> blocks if reasoning is disabled
                                            tempContent = displayContent.replace(/<think>[\s\S]*?<\/think>/g, '');
                                            // Apply markdown if available
                                            if (isMarkedLoaded) {
                                                tempContent = marked.parse(tempContent);
                                            }
                                        }
                                        
                                        // Update the content
                                        assistantContent.innerHTML = tempContent || '<div class="spinner"></div>';
                                        
                                        // Apply syntax highlighting if available
                                        if (isHljsLoaded && isMarkedLoaded) {
                                            assistantContent.querySelectorAll('pre code').forEach((block) => {
                                                hljs.highlightElement(block);
                                            });
                                        }
                                        
                                        // Scroll to bottom
                                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                                    }
                                }
                            } catch (e) {
                                console.error('Error parsing SSE data:', e);
                            }
                        }
                    });
                    
                    // Continue reading
                    return reader.read().then(processResult);
                }
                
                // Start reading the stream
                reader.read().then(processResult).catch(error => {
                    debugLog(`Error reading stream: ${error.message}`);
                    reject(new Error(`Could not read response stream. ${error.message}`));
                });
            })
            .catch(error => {
                debugLog(`Fetch error: ${error.message}`);
                reject(new Error(`Failed to initiate chat: ${error.message}`));
            });
        });
    }
    
    function saveChats() {
        localStorage.setItem('chutesChats', JSON.stringify(chats));
    }
});
