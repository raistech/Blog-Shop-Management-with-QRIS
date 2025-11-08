/**
 * RSA Store - Post Editor JavaScript
 * Handles blog post editor functionality
 */

// Download Management Functions
window.showAddDownload = function() {
    const modal = document.getElementById('addDownloadModal');
    if (modal) {
        modal.style.display = 'flex';
        console.log('Show add download modal');
    } else {
        console.error('Modal not found');
    }
};

window.closeDownloadModal = function() {
    const modal = document.getElementById('addDownloadModal');
    if (modal) {
        modal.style.display = 'none';
        document.getElementById('downloadTitle').value = '';
        document.getElementById('downloadUrl').value = '';
        document.getElementById('downloadSize').value = '';
        document.getElementById('requiresToken').checked = true;
    }
};

window.submitDownload = async function() {
    const title = document.getElementById('downloadTitle').value;
    const file_url = document.getElementById('downloadUrl').value;
    const file_size = document.getElementById('downloadSize').value;
    const requires_token = document.getElementById('requiresToken').checked;
    
    if (!title || !file_url) {
        if (window.RSAStore && window.RSAStore.showNotification) {
            window.RSAStore.showNotification('Title and URL are required', 'error');
        } else {
            alert('Title and URL are required');
        }
        return;
    }
    
    // Get post ID from URL
    const pathParts = window.location.pathname.split('/');
    const postId = pathParts[pathParts.length - 1];
    
    if (!postId || postId === 'create') {
        alert('Please save the post first before adding downloads');
        return;
    }
    
    try {
        const response = await fetch(`/admin/blog/posts/${postId}/downloads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                file_url,
                file_size: file_size ? parseInt(file_size) * 1024 * 1024 : 0,
                requires_token
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (window.RSAStore && window.RSAStore.showNotification) {
                window.RSAStore.showNotification('Download added successfully!', 'success');
            } else {
                alert('Download added successfully!');
            }
            window.closeDownloadModal();
            setTimeout(function() { 
                window.location.reload(); 
            }, 1000);
        } else {
            if (window.RSAStore && window.RSAStore.showNotification) {
                window.RSAStore.showNotification(data.error || 'Failed to add download', 'error');
            } else {
                alert(data.error || 'Failed to add download');
            }
        }
    } catch (error) {
        console.error('Error adding download:', error);
        if (window.RSAStore && window.RSAStore.showNotification) {
            window.RSAStore.showNotification('Error: ' + error.message, 'error');
        } else {
            alert('Error: ' + error.message);
        }
    }
};

window.deleteDownload = async function(downloadId) {
    if (!confirm('Are you sure you want to delete this download?')) {
        return;
    }
    
    try {
        const response = await fetch(`/admin/blog/posts/downloads/delete/${downloadId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (window.RSAStore && window.RSAStore.showNotification) {
                window.RSAStore.showNotification('Download deleted successfully', 'success');
            } else {
                alert('Download deleted successfully');
            }
            setTimeout(function() { 
                window.location.reload(); 
            }, 1000);
        } else {
            if (window.RSAStore && window.RSAStore.showNotification) {
                window.RSAStore.showNotification(data.error || 'Failed to delete', 'error');
            } else {
                alert(data.error || 'Failed to delete');
            }
        }
    } catch (error) {
        console.error('Error deleting download:', error);
        if (window.RSAStore && window.RSAStore.showNotification) {
            window.RSAStore.showNotification('Error: ' + error.message, 'error');
        } else {
            alert('Error: ' + error.message);
        }
    }
};

// Close modal when clicking outside
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('addDownloadModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                window.closeDownloadModal();
            }
        });
    }
    
    console.log('Post editor functions initialized');
});
