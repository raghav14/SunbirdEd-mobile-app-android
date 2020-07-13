import { Component, Inject } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  CheckUserExistsRequest,
  ProfileService,
  GroupService,
  AddMembersRequest,
  GroupMemberRole,
  GroupMember
} from 'sunbird-sdk';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import {
  AppHeaderService,
  CommonUtilService,
  Environment, ID,
  InteractSubtype,
  InteractType,
  PageId,
  TelemetryGeneratorService
} from '@app/services';
import { PopoverController } from '@ionic/angular';
import { animationGrowInTopRight } from '../../animations/animation-grow-in-top-right';
import { animationShrinkOutTopRight } from '../../animations/animation-shrink-out-top-right';
import { MyGroupsPopoverComponent } from '../../components/popups/sb-my-groups-popover/sb-my-groups-popover.component';

@Component({
  selector: 'app-add-member-to-group',
  templateUrl: './add-member-to-group.page.html',
  styleUrls: ['./add-member-to-group.page.scss'],
})
export class AddMemberToGroupPage {

  username = '';
  isUserIdVerified = false;
  showErrorMsg = false;
  headerObservable: any;
  groupId: string;
  memberList: GroupMember[] = [];
  userDetails;
  private unregisterBackButton: Subscription;
  appName: string;

  constructor(
    @Inject('PROFILE_SERVICE') private profileService: ProfileService,
    @Inject('GROUP_SERVICE') public groupService: GroupService,
    private headerService: AppHeaderService,
    private router: Router,
    private location: Location,
    private platform: Platform,
    private commonUtilService: CommonUtilService,
    private popoverCtrl: PopoverController,
    private telemetryGeneratorService: TelemetryGeneratorService
  ) {
    const extras = this.router.getCurrentNavigation().extras.state;
    this.groupId = extras.groupId;
    this.memberList = extras.memberList;
  }

  ionViewWillEnter() {
    this.headerService.showHeaderWithBackButton();
    this.headerObservable = this.headerService.headerEventEmitted$.subscribe(eventName => {
      this.handleHeaderEvents(eventName);
    });
    this.handleDeviceBackButton();
    this.commonUtilService.getAppName().then((res) => { this.appName = res; });
  }

  ionViewWillLeave() {
    this.headerObservable.unsubscribe();
    if (this.unregisterBackButton) {
      this.unregisterBackButton.unsubscribe();
    }
  }

  handleDeviceBackButton() {
    this.unregisterBackButton = this.platform.backButton.subscribeWithPriority(10, () => {
      this.handleBackButton(false);
    });
  }

  handleHeaderEvents($event) {
    switch ($event.name) {
      case 'back':
        this.handleBackButton(true);
        break;
    }
  }

  handleBackButton(isNavBack) {
    if (this.isUserIdVerified) {
      this.isUserIdVerified = false;
    } else {
      this.telemetryGeneratorService.generateBackClickedTelemetry(PageId.ADD_MEMBER, Environment.GROUP, isNavBack);
      this.location.back();
    }
  }

  async onVerifyClick() {
    this.telemetryGeneratorService.generateInteractTelemetry(
      InteractType.TOUCH,
      InteractSubtype.VERIFY_CLICKED,
      Environment.GROUP,
      PageId.ADD_MEMBER);
    if (!this.username) {
      this.showErrorMsg = true;
      return;
    }
    this.showErrorMsg = false;
    const checkUserExistsRequest: CheckUserExistsRequest = {
      matching: {
        key: 'userName',
        value: this.username
      },
      captchaResponseToken: ''
    };
    this.telemetryGeneratorService.generateInteractTelemetry(
      InteractType.INITIATED,
      '',
      Environment.GROUP,
      PageId.ADD_MEMBER,
      undefined,
      undefined,
      undefined,
      undefined,
      ID.VERIFY_MEMBER);
    const loader = await this.commonUtilService.getLoader();
    await loader.present();
    this.profileService.checkServerProfileExists(checkUserExistsRequest).toPromise()
      .then(async (checkUserExistsResponse) => {
        await loader.dismiss();
        if (checkUserExistsResponse && checkUserExistsResponse.exists) {
          this.userDetails = checkUserExistsResponse;
          this.isUserIdVerified = true;
          this.telemetryGeneratorService.generateInteractTelemetry(
            InteractType.SUCCESS,
            '',
            Environment.GROUP,
            PageId.ADD_MEMBER,
            undefined,
            undefined,
            undefined,
            undefined,
            ID.VERIFY_MEMBER);
        } else {
          this.showErrorMsg = true;
        }
      }).catch(async (e) => {
        console.error(e);
        await loader.dismiss();
      });
  }

  onClearUser() {
    this.isUserIdVerified = false;
    this.username = '';
  }

  async onAddToGroupClick() {
    const userExist = this.memberList.find(m => m.userId === this.userDetails.userId);
    // Check if user already exist in group
    if (userExist) {
      this.commonUtilService.showToast('MEMBER_ALREADY_EXISTS_IN_GROUP');
      return;
    }

    this.telemetryGeneratorService.generateInteractTelemetry(
      InteractType.TOUCH,
      InteractSubtype.ADD_MEMBER_TO_GROUP_CLICKED,
      Environment.GROUP,
      PageId.ADD_MEMBER);
    const loader = await this.commonUtilService.getLoader();
    await loader.present();
    this.telemetryGeneratorService.generateInteractTelemetry(
      InteractType.INITIATED,
      '',
      Environment.GROUP,
      PageId.ADD_MEMBER,
      undefined,
      undefined,
      undefined,
      undefined,
      ID.ADD_MEMBER_TO_GROUP);
    const addMemberToGroupReq: AddMembersRequest = {
      groupId: this.groupId,
      addMembersRequest: {
        members: [{
          userId: this.userDetails.id,
          role: GroupMemberRole.MEMBER
        }]
      }
    };
    this.groupService.addMembers(addMemberToGroupReq).toPromise()
      .then(async (res) => {
        if (res.error && res.error.members && res.error.members.length) {
          throw res.error.members[0];
        } else {
          await loader.dismiss();
          this.telemetryGeneratorService.generateInteractTelemetry(
            InteractType.SUCCESS,
            '',
            Environment.GROUP,
            PageId.ADD_MEMBER,
            undefined,
            undefined,
            undefined,
            undefined,
            ID.ADD_MEMBER_TO_GROUP);
          this.commonUtilService.showToast('MEMBER_ADDED_TO_GROUP');
          this.location.back();
        }
      }).catch(async (e) => {
        console.error(e);
        await loader.dismiss();
        this.commonUtilService.showToast('SOMETHING_WENT_WRONG');
      });
  }

  async openInfoPopup() {
    const popover = await this.popoverCtrl.create({
      component: MyGroupsPopoverComponent,
      componentProps: {
        isFromAddMember: true
      },
      enterAnimation: animationGrowInTopRight,
      leaveAnimation: animationShrinkOutTopRight,
      backdropDismiss: false,
      showBackdrop: true,
      cssClass: 'popover-my-groups'
    });
    await popover.present();
    const { data } = await popover.onDidDismiss();
    if (data === undefined) { // Backdrop clicked
    } else if (data.closeDeletePopOver) { // Close clicked
    } else if (data.canDelete) {
    }
  }

}
