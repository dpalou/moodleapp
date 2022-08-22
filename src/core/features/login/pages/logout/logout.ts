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

import { Component, OnInit } from '@angular/core';
import { CoreSites } from '@services/sites';
import { CoreConstants } from '@/core/constants';
import { CoreNavigator } from '@services/navigator';
import { CoreLoginHelper } from '@features/login/services/login-helper';

/**
 * Page that logs the user out.
 */
@Component({
    selector: 'page-core-login-logout',
    templateUrl: 'logout.html',
})
export class CoreLoginLogoutPage implements OnInit {

    /**
     * @inheritdoc
     */
    async ngOnInit(): Promise<void> {
        const siteId = CoreNavigator.getRouteParam('newSiteId');
        const addSite = CoreNavigator.getRouteBooleanParam('addSite');

        if (addSite) {
            await CoreLoginHelper.goToAddSite(true, true);
        } else if (siteId) {
            // Changing to a different site. This navigation will logout and navigate to the site home.
            await CoreNavigator.navigateToSiteHome({ preferCurrentTab: false , siteId });
        } else {
            await CoreSites.logout({
                forceLogout: true,
                removeAccount: !!CoreConstants.CONFIG.removeaccountonlogout,
            });
        }

    }

}
