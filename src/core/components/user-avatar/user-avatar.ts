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

import { Component, OnInit, OnDestroy, input, computed, signal, linkedSignal, resource } from '@angular/core';

import { CoreSiteBasicInfo, CoreSites } from '@services/sites';
import { CoreUtils } from '@singletons/utils';
import { CoreEventObserver, CoreEvents } from '@singletons/events';
import { CoreUserBasicData } from '@features/user/services/user';
import { CoreNavigator } from '@services/navigator';
import { CoreNetwork } from '@services/network';
import { CoreUserHelper } from '@features/user/services/user-helper';
import { CoreUrl } from '@singletons/url';
import { CoreSiteInfo } from '@classes/sites/unauthenticated-site';
import { toBoolean } from '@/core/transforms/boolean';
import { CoreBaseModule } from '@/core/base.module';
import { CoreExternalContentDirective } from '@directives/external-content';
import { CoreAriaButtonClickDirective } from '@directives/aria-button';
import { CORE_USER_PROFILE_PICTURE_UPDATED } from '@features/user/constants';

/**
 * Component to display a "user avatar".
 *
 * Example: <core-user-avatar [user]="participant"></core-user-avatar>
 */
@Component({
    selector: 'core-user-avatar',
    templateUrl: 'core-user-avatar.html',
    styleUrl: 'user-avatar.scss',
    imports: [
        CoreBaseModule,
        CoreExternalContentDirective,
        CoreAriaButtonClickDirective,
    ],
})
export class CoreUserAvatarComponent implements OnInit, OnDestroy {

    readonly user = input<CoreUserWithAvatar>(); // @todo Fix the accepted type and restrict it a bit.
    readonly site = input<CoreSiteBasicInfo | CoreSiteInfo>(); // Site info contains user info.
    // The following params will override the ones in user object.
    readonly profileUrl = input<string>();
    readonly linkProfile = input(true, { transform: toBoolean }); // Avoid linking to the profile if wanted.
    readonly fullname = input<string>();
    readonly userId = input<number>(); // If provided or found it will be used to link the image to the profile.
    readonly courseId = input<number>();
    readonly checkOnline = input(false, { transform: toBoolean }); // If want to check and show online status.
    readonly siteId = input<string>();

    readonly computedUser = resource({
        params: () => ({
            user: this.user(),
            site: this.site(),
        }),
        loader: async ({ params }) => {
            if (params.user) {
                return params.user;
            }

            if (!params.site) {
                return undefined;
            }

            return {
                id: ('userid' in params.site ? params.site.userid : params.site.userId)
                    ?? (await CoreSites.getSite(this.computedSiteId())).getUserId(),
                fullname: params.site.fullname ?? '',
                firstname: params.site.firstname ?? '',
                lastname: params.site.lastname ?? '',
                profileimageurl: params.site.userpictureurl ?? '',
            };
        },
    });

    readonly computedUserId = computed(() => this.userId() || this.computedUser.value()?.userid || this.computedUser.value()?.id);
    readonly computedFullname = computed(() =>
        this.fullname() || this.computedUser.value()?.fullname || this.computedUser.value()?.userfullname);

    readonly computedSiteId = computed(() => {
        if (this.siteId()) {
            return this.siteId();
        }

        const site = this.site();

        return site && 'id' in site ? site.id : CoreSites.getCurrentSiteId();
    });

    readonly avatarUrl = linkedSignal(() => {
        const profileUrl = this.profileUrl() || this.computedUser.value()?.profileimageurl ||
            this.computedUser.value()?.userprofileimageurl || this.computedUser.value()?.userpictureurl ||
            this.computedUser.value()?.profileimageurlsmall || this.computedUser.value()?.urls?.profileimage;

        if (profileUrl === undefined || CoreUrl.isThemeImageUrl(profileUrl)) {
            return undefined;
        }

        return profileUrl;
    });

    readonly imageError = signal(false);

    readonly initials = resource({
        params: () => ({
            user: this.computedUser.value(),
            fullname: this.computedFullname(),
            userId: this.computedUserId(),
        }),
        loader: async ({ params }) => CoreUserHelper.getUserInitialsFromParts({
            firstname: params.user?.firstname,
            lastname: params.user?.lastname,
            fullname: params.fullname,
            userId: params.userId,
        }),
    });

    protected readonly fallbackUserData = signal<CoreUserWithAvatar|undefined>(undefined);

    // Variable to check if we consider this user online or not.
    // @todo Use setting when available (see MDL-63972) so we can use site setting.
    protected timetoshowusers = 300000; // Miliseconds default.
    protected pictureObserver: CoreEventObserver;

    constructor() {
        this.pictureObserver = CoreEvents.on(
            CORE_USER_PROFILE_PICTURE_UPDATED,
            (data) => {
                if (data.userId === this.computedUserId()) {
                    this.avatarUrl.set(data.picture);
                }
            },
            CoreSites.getCurrentSiteId(),
        );
    }

    /**
     * @inheritdoc
     */
    async ngOnInit(): Promise<void> {
        const site = this.site();

        if (site && !this.user()) {
            this.fallbackUserData.set({
                id: ('userid' in site
                    ? site.userid
                    : site.userId)
                    ?? (await CoreSites.getSite(this.computedSiteId())).getUserId(),
                fullname: site.fullname ?? '',
                firstname: site.firstname ?? '',
                lastname: site.lastname ?? '',
                profileimageurl: site.userpictureurl ?? '',
            });
        }
    }

    /**
     * Avatar image loading handler.
     */
    imageLoaded(success: boolean): void {
        this.imageError.set(!success);
    }

    /**
     * Helper function for checking the time meets the 'online' condition.
     *
     * @returns boolean
     */
    isOnline(): boolean {
        const user = this.computedUser.value();
        if (!user) {
            return false;
        }

        if (CoreUtils.isFalseOrZero(user.isonline)) {
            return false;
        }

        if (user.lastaccess) {
            // If the time has passed, don't show the online status.
            const time = Date.now() - this.timetoshowusers;

            return user.lastaccess * 1000 >= time;
        } else {
            // You have to have Internet access first.
            return !!user.isonline && CoreNetwork.isOnline();
        }
    }

    /**
     * Go to user profile.
     *
     * @param event Click event.
     */
    gotoProfile(event: Event): void {
        if (!this.linkProfile() || !this.computedUserId()) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        CoreNavigator.navigateToSitePath('user', {
            params: {
                userId: this.computedUserId(),
                courseId: this.courseId() || this.computedUser.value()?.courseid,
            },
        });
    }

    /**
     * @inheritdoc
     */
    ngOnDestroy(): void {
        this.pictureObserver.off();
    }

}

/**
 * Type with all possible formats of user.
 */
export type CoreUserWithAvatar = CoreUserBasicData & {
    userpictureurl?: string;
    userprofileimageurl?: string;
    profileimageurlsmall?: string;
    urls?: {
        profileimage?: string;
    };
    userfullname?: string;
    userid?: number;
    isonline?: boolean;
    courseid?: number;
    lastaccess?: number;
    firstname?: string; // The first name(s) of the user.
    lastname?: string; // The family name of the user.
};
