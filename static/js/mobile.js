document.addEventListener('DOMContentLoaded', () => {
    // Mobile-specific functionality
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const toggleSidebarBtn = document.getElementById('toggle-sidebar');
    const closeSidebarBtn = document.getElementById('close-sidebar');
    
    // Function to toggle sidebar
    function toggleSidebar() {
        sidebar.classList.toggle('active');
        sidebarOverlay.classList.toggle('active');
        document.body.classList.toggle('no-scroll');
    }
    
    // Show sidebar
    toggleSidebarBtn.addEventListener('click', toggleSidebar);
    
    // Hide sidebar
    closeSidebarBtn.addEventListener('click', toggleSidebar);
    sidebarOverlay.addEventListener('click', toggleSidebar);
    
    // Handle orientation changes
    window.addEventListener('resize', () => {
        // If we're in landscape and the sidebar is open, close it
        if (window.innerWidth > window.innerHeight && sidebar.classList.contains('active')) {
            toggleSidebar();
        }
    });
    
    // Fix for virtual keyboard issues
    const userInput = document.getElementById('user-input');
    userInput.addEventListener('focus', () => {
        // Small delay to let the keyboard appear
        setTimeout(() => {
            // Scroll to make sure the input is visible
            userInput.scrollIntoView({ behavior: 'smooth' });
        }, 300);
    });
    
    // Handle back button to close sidebar if open
    window.addEventListener('popstate', (event) => {
        if (sidebar.classList.contains('active')) {
            toggleSidebar();
            // Prevent default back action
            history.pushState(null, document.title, window.location.href);
            event.preventDefault();
            return false;
        }
    });
    
    // Add history entry for handling back button
    history.pushState(null, document.title, window.location.href);
});
