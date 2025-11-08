/**
 * Mobile Layout Fix
 * Force override inline styles on mobile devices
 */

(function() {
    'use strict';
    
    // Only run on mobile devices (max-width: 767px)
    function isMobile() {
        return window.innerWidth <= 767;
    }
    
    function fixMobileSpacing() {
        if (!isMobile()) return;
        
        console.log('[Mobile Fix] Applying mobile spacing fixes...');
        
        // Fix all sections with inline styles - ZERO GAP for first section
        const sections = document.querySelectorAll('section.container[style], section[style]');
        sections.forEach((section, index) => {
            const isFirstAfterHero = section.previousElementSibling?.classList.contains('hero');
            
            // ZERO margin for first section after hero!
            section.style.setProperty('margin-top', isFirstAfterHero ? '0' : '1.5rem', 'important');
            section.style.setProperty('margin-bottom', '1.5rem', 'important');
            section.style.setProperty('padding-top', '0', 'important');
            section.style.setProperty('padding-bottom', '0', 'important');
            
            // Force reflow
            void section.offsetHeight;
            
            console.log(`[Mobile Fix] Section ${index + 1}: margin-top = ${isFirstAfterHero ? '0 (ZERO GAP!)' : '1.5rem'}`);
        });
        
        // Extra fix: find ALL sections (even without inline styles)
        const allSections = document.querySelectorAll('section.container');
        allSections.forEach((section, index) => {
            const isFirstAfterHero = section.previousElementSibling?.classList.contains('hero');
            if (isFirstAfterHero) {
                section.style.setProperty('margin-top', '0', 'important');
                section.style.setProperty('padding-top', '0', 'important');
                void section.offsetHeight; // Force reflow
                console.log('[Mobile Fix] FORCED first section after hero: ZERO margin & padding!');
            }
        });
        
        // Fix inner divs with inline styles inside sections
        const innerDivs = document.querySelectorAll('section.container > div[style]');
        innerDivs.forEach((div, index) => {
            // Check if it's a centered div (usually section headers)
            const isCentered = div.style.textAlign === 'center' || 
                              div.getAttribute('style')?.includes('text-align: center');
            
            if (isCentered) {
                // Reduce margins for section headers
                if (div.style.marginBottom) {
                    div.style.setProperty('margin-bottom', '1rem', 'important');
                }
                if (div.style.marginTop) {
                    div.style.setProperty('margin-top', '1rem', 'important');
                }
                console.log(`[Mobile Fix] Centered div ${index + 1}: margins reduced`);
            }
        });
        
        // Fix hero section - FORCE COMPACT with 15px bottom space
        const hero = document.querySelector('.hero');
        if (hero) {
            hero.style.setProperty('padding', '1.5rem 0 0.9375rem', 'important'); // 15px bottom padding
            hero.style.setProperty('padding-bottom', '0.9375rem', 'important'); // 15px
            hero.style.setProperty('margin-bottom', '0', 'important');
            hero.style.setProperty('min-height', 'auto', 'important'); // Remove min-height
            hero.style.setProperty('height', 'auto', 'important'); // Auto height
            hero.style.setProperty('display', 'block', 'important'); // Not flex
            console.log('[Mobile Fix] Hero section: padding-bottom = 15px, min-height = auto');
            
            // Fix hero description margin - compact
            const heroDesc = hero.querySelector('.hero-description');
            if (heroDesc) {
                heroDesc.style.setProperty('margin-bottom', '0.75rem', 'important'); // 12px
                console.log('[Mobile Fix] Hero description margin: 0.75rem (12px)');
            }
            
            // Fix hero title margin - compact
            const heroTitle = hero.querySelector('.hero-title');
            if (heroTitle) {
                heroTitle.style.setProperty('margin-bottom', '0.5rem', 'important'); // 8px
                console.log('[Mobile Fix] Hero title margin: 0.5rem (8px)');
            }
            
            // Fix hero actions wrapper - ZERO all spacing
            const heroActions = hero.querySelector('.hero-actions');
            if (heroActions) {
                heroActions.style.setProperty('margin', '0', 'important');
                heroActions.style.setProperty('margin-bottom', '0', 'important');
                heroActions.style.setProperty('margin-top', '0', 'important');
                heroActions.style.setProperty('padding', '0', 'important');
                heroActions.style.setProperty('padding-bottom', '0', 'important');
                heroActions.style.setProperty('padding-top', '0', 'important');
                console.log('[Mobile Fix] Hero actions wrapper: ALL spacing = 0');
            }
            
            // Fix hero content - FORCE COMPACT HEIGHT
            const heroContent = hero.querySelector('.hero-content');
            if (heroContent) {
                heroContent.style.setProperty('padding', '0', 'important');
                heroContent.style.setProperty('padding-bottom', '0', 'important');
                heroContent.style.setProperty('margin', '0', 'important');
                heroContent.style.setProperty('margin-bottom', '0', 'important');
                heroContent.style.setProperty('min-height', 'auto', 'important');
                heroContent.style.setProperty('height', 'auto', 'important');
                heroContent.style.setProperty('display', 'block', 'important');
                console.log('[Mobile Fix] Hero content: ALL spacing = 0, height = auto');
            }
            
            // Fix hero container
            const heroContainer = hero.querySelector('.container');
            if (heroContainer) {
                heroContainer.style.setProperty('padding-bottom', '0', 'important');
                heroContainer.style.setProperty('margin-bottom', '0', 'important');
                heroContainer.style.setProperty('min-height', 'auto', 'important');
                heroContainer.style.setProperty('height', 'auto', 'important');
                console.log('[Mobile Fix] Hero container: bottom spacing = 0, height = auto');
            }
            
            // Force hero buttons to have MINIMAL padding and margins
            const heroButtons = hero.querySelectorAll('.btn');
            heroButtons.forEach((btn, i) => {
                btn.style.setProperty('margin', '0', 'important');
                btn.style.setProperty('margin-bottom', '0', 'important');
                btn.style.setProperty('margin-top', '0', 'important');
                btn.style.setProperty('padding', '0.5rem 1rem', 'important'); // Reduce padding
                btn.style.setProperty('line-height', '1.2', 'important'); // Reduce line-height
                console.log(`[Mobile Fix] Hero button ${i+1}: margins=0, padding=0.5rem 1rem`);
            });
            
            // Fix hero actions - ZERO margins/paddings, minimal gap
            const heroActionsGap = hero.querySelector('.hero-actions');
            if (heroActionsGap) {
                heroActionsGap.style.setProperty('gap', '0.5rem', 'important'); // 8px gap between buttons
                heroActionsGap.style.setProperty('row-gap', '0.5rem', 'important');
                heroActionsGap.style.setProperty('column-gap', '0.5rem', 'important');
                heroActionsGap.style.setProperty('padding', '0', 'important'); // ZERO padding
                heroActionsGap.style.setProperty('padding-bottom', '0', 'important');
                heroActionsGap.style.setProperty('padding-top', '0', 'important');
                heroActionsGap.style.setProperty('margin', '0', 'important'); // ZERO margin
                heroActionsGap.style.setProperty('margin-bottom', '0', 'important');
                heroActionsGap.style.setProperty('margin-top', '0', 'important');
                console.log('[Mobile Fix] Hero actions: ALL margins/paddings = 0, gap = 8px');
            }
            
            // Force ALL children of hero to have no bottom margin/padding
            const heroChildren = hero.querySelectorAll('*');
            let fixedCount = 0;
            heroChildren.forEach((child) => {
                const computed = window.getComputedStyle(child);
                const marginBottom = parseFloat(computed.marginBottom);
                const paddingBottom = parseFloat(computed.paddingBottom);
                
                if (marginBottom > 15 || paddingBottom > 15) {
                    child.style.setProperty('margin-bottom', '0', 'important');
                    child.style.setProperty('padding-bottom', '0', 'important');
                    fixedCount++;
                    console.log(`[Mobile Fix] Fixed hero child with large margin/padding: ${child.tagName}.${child.className}`);
                }
            });
            
            if (fixedCount > 0) {
                console.log(`[Mobile Fix] Fixed ${fixedCount} hero children with excessive spacing`);
            }
            
            // Force reflow to ensure styles are applied
            void hero.offsetHeight;
        }
        
        // Fix grids - remove top margin/padding
        const grids = document.querySelectorAll('.grid');
        console.log(`[Mobile Fix] Found ${grids.length} grid elements`);
        grids.forEach((grid, index) => {
            grid.style.setProperty('gap', '1rem', 'important');
            grid.style.setProperty('margin-top', '0', 'important');
            grid.style.setProperty('padding-top', '0', 'important');
            console.log(`[Mobile Fix] Grid ${index + 1}: gap=1rem, margin-top=0, padding-top=0`);
            
            // Check if grid is first child of section after hero
            const section = grid.closest('section.container');
            if (section && section.previousElementSibling?.classList.contains('hero')) {
                console.log(`[Mobile Fix] Grid ${index + 1} is FIRST after hero - forcing zero spacing`);
            }
        });
        
        // NUCLEAR OPTION: Fix ALL first children of sections after hero
        const allSectionsAfterHero = document.querySelectorAll('section.container');
        allSectionsAfterHero.forEach((section) => {
            const isFirstAfterHero = section.previousElementSibling?.classList.contains('hero');
            if (isFirstAfterHero) {
                // Get ALL direct children
                const children = section.children;
                for (let i = 0; i < children.length; i++) {
                    const child = children[i];
                    child.style.setProperty('margin-top', '0', 'important');
                    child.style.setProperty('padding-top', '0', 'important');
                    console.log(`[Mobile Fix] Fixed first section child ${i+1}: ${child.tagName}.${child.className}`);
                }
            }
        });
        
        // Fix CTA card with large padding
        const ctaCards = document.querySelectorAll('section.container .card[style*="padding: 3rem"]');
        ctaCards.forEach((card, index) => {
            card.style.setProperty('padding', '2rem 1.5rem', 'important');
            console.log(`[Mobile Fix] CTA card ${index + 1}: padding reduced`);
        });
        
        console.log('[Mobile Fix] All spacing fixes applied successfully!');
    }
    
    // Run on page load with multiple attempts to ensure it works
    function runFix() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                fixMobileSpacing();
                // Run again after 100ms to ensure DOM is fully ready
                setTimeout(fixMobileSpacing, 100);
            });
        } else {
            fixMobileSpacing();
            // Run again after 100ms to ensure all elements are loaded
            setTimeout(fixMobileSpacing, 100);
            // And once more after 500ms for safety
            setTimeout(fixMobileSpacing, 500);
        }
    }
    
    runFix();
    
    // Re-run on window resize (if user rotates device)
    let resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            if (isMobile()) {
                fixMobileSpacing();
            }
        }, 250);
    });
    
    // Also run when window finishes loading (backup)
    window.addEventListener('load', function() {
        console.log('[Mobile Fix] Window loaded, running fix again...');
        setTimeout(fixMobileSpacing, 100);
    });
    
    console.log('[Mobile Fix] Script loaded. Current width:', window.innerWidth + 'px');
})();
