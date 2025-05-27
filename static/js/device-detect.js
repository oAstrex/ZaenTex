document.addEventListener('DOMContentLoaded', () => {
    // Simple mobile detection
    function isMobileDevice() {
        return (window.innerWidth <= 768) || 
               /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    // Check if we're on mobile but not already on the mobile page
    if (isMobileDevice() && !window.location.pathname.includes('/mobile')) {
        window.location.href = '/mobile';
    }
    
    // If we're on desktop but on the mobile page, go back to main page
    if (!isMobileDevice() && window.location.pathname.includes('/mobile')) {
        window.location.href = '/';
    }
});
