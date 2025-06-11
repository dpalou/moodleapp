// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Component, OnInit, OnDestroy, input, computed, signal, resource, linkedSignal } from '@angular/core';
import { CoreSites } from '@services/sites';
import { CoreEventObserver, CoreEvents } from '@singletons/events';
import { CoreSite } from '@classes/sites/site';
import { toBoolean } from '@/core/transforms/boolean';
import { CorePromiseUtils } from '@singletons/promise-utils';
import { CoreUnauthenticatedSite } from '@classes/sites/unauthenticated-site';
import { CoreConstants } from '@/core/constants';
import { CoreBaseModule } from '@/core/base.module';
import { CoreExternalContentDirective } from '@directives/external-content';
import { CoreFormatTextDirective } from '@directives/format-text';

/**
 * Component to render the current site logo.
 */
@Component({
    selector: 'core-site-logo',
    templateUrl: 'site-logo.html',
    styleUrl: 'site-logo.scss',
    imports: [
        CoreBaseModule,
        CoreExternalContentDirective,
        CoreFormatTextDirective,
    ],
})
export class CoreSiteLogoComponent implements OnInit, OnDestroy {

    readonly hideOnError = input(false, { transform: toBoolean });
    readonly siteNameMode = input<CoreSiteLogoSiteNameMode>(CoreSiteLogoSiteNameMode.NOTAG);
    readonly showLogo = input(true);
    readonly site = input<CoreSite | CoreUnauthenticatedSite>();
    readonly logoType = input<'top' | 'login'>('login');
    readonly logoLoaded = signal(false);
    readonly logoError = signal(false);
    readonly fallbackLogo = computed(() => this.logoType() === 'top' ? 'assets/img/top_logo.png' : 'assets/img/login_logo.png');
    readonly isLogoTopAndHidden = computed(() => this.logoType() === 'top' && this.siteInstance().getShowTopLogo() === 'hidden');
    readonly showSiteName = computed(() => this.logoType() !== 'top' || this.siteInstance().getShowTopLogo() === 'hidden');
    readonly appName = CoreConstants.CONFIG.appname;

    readonly siteId = computed(() => {
        const site = this.siteInstance();

        return site instanceof CoreSite ? site.getId() : undefined;
    });

    readonly siteName = resource({
        params: () => ({
            showSiteName: this.showSiteName(),
            siteInfo: this.siteInfo(), // Update name if site info changes, but use getSiteName instead of the info directly.
        }),
        loader: async ({ params }): Promise<string> => {
            if (!params.showSiteName) {
                return '';
            }

            const siteName = await this.siteInstance().getSiteName();

            return siteName || '';
        },
    });

    readonly displaySiteLogo = computed(() => {
        if (this.logoError() && this.hideOnError()) {
            return false;
        }

        if (this.isLogoTopAndHidden()) {
            return false;
        }

        return this.showLogo();
    });

    readonly siteLogo = resource({
        params: () => ({
            siteInfo: this.siteInfo(),
            logoType: this.logoType(),
            showLogo: this.showLogo(),
        }),
        loader: async ({ params }): Promise<string | undefined> => {
            const logoUrl = !this.isLogoTopAndHidden() && params.showLogo ? await this.getLogoUrl() : undefined;

            this.logoError.set(false);
            this.logoLoaded.set(true);

            return logoUrl;
        },
    });

    protected readonly siteInstance = computed(() => this.site() ?? CoreSites.getRequiredCurrentSite());
    protected readonly siteInfo = linkedSignal(() => { // Used to notify when the site info could have changed, to update info.
        const site = this.siteInstance();

        return site instanceof CoreSite ? site.getInfo() : undefined;
    });

    protected updateSiteObserver?: CoreEventObserver;

    /**
     * @inheritdoc
     */
    async ngOnInit(): Promise<void> {
        this.updateSiteObserver = CoreEvents.on(CoreEvents.SITE_UPDATED, async (data) => {
            if (data.siteId === this.siteId()) {
                this.siteInfo.set(data);
            }
        }, this.siteId());
    }

    /**
     * Function to handle the image loaded.
     */
    imageLoaded(success: boolean): void {
        this.logoError.set(!success);
    }

    /**
     * Get the site logo URL.
     *
     * @returns Logo URL.
     */
    protected async getLogoUrl(): Promise<string | undefined> {
        // Get the public config to avoid race conditions when retrieving the logo.
        const siteConfig = await CorePromiseUtils.ignoreErrors(this.siteInstance().getPublicConfig());

        return this.logoType() === 'top'
            ? this.siteInstance().getTopLogoUrl(siteConfig)
            : this.siteInstance().getLogoUrl(siteConfig);
    }

    /**
     * @inheritdoc
     */
    ngOnDestroy(): void {
        this.updateSiteObserver?.off();
    }

}

export const enum CoreSiteLogoSiteNameMode {
    HEADING2 = 'h2',
    PARAGRAPH = 'p',
    NOTAG = '',
}
