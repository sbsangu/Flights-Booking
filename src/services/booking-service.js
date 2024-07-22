const axios = require('axios');
const {StatusCodes} = require('http-status-codes');

const { BookingRepository } = require('../repositories');
const { ServerConfig } = require('../config')
const db = require('../models');
const AppError = require('../utils/errors/app-error');
const { Enums } = require('../utils/common');

const {BOOKED,CANCELLED}=Enums.BOOKING_STATUS

const bookingRepository=new BookingRepository()

async function createBooking(data) {

    const transaction=await db.sequelize.transaction();

    try {

        const flight = await axios.get(`${ServerConfig.FLIGHT_SERVICE}/api/v1/flights/${data.flightId}`);
            console.log(typeof flight);
            const flightData = flight.data.data;
            if(data.noOfSeats > flightData.totalSeats) {
                throw new AppError('Not enough seats available', StatusCodes.BAD_REQUEST);
            }

            const totalBillingAmount=data.noOfSeats* flightData.price;
            const bookingPayload={...data,totalCost:totalBillingAmount};
            const booking=await bookingRepository.createBooking(bookingPayload,transaction)

            await axios.patch(`${ServerConfig.FLIGHT_SERVICE}/api/v1/flights/${data.flightId}/seats`,{
                seats:data.noOfSeats
            })
            await transaction.commit();
            return true;

        
    } catch (error) {
        console.log(error.message)
        await transaction.rollback();
        throw error;

    }

}


async function makePayment(data){
    const transaction=await db.sequelize.transaction();
    try {

        const booking=await bookingRepository.get(data.bookingId,transaction);
        if(booking.status==CANCELLED){
            throw new AppError('Booking has expired',StatusCodes.BAD_REQUEST);
        }
        
        const bookingTime=new Date(booking.createdAt);
        const currentTime=new Date();

        if(currentTime-bookingTime>30000){
            await bookingRepository.update(data.bookingId,{status:CANCELLED},transaction);
            throw new AppError('Booking has expired',StatusCodes.BAD_REQUEST);
        }

        if(booking.totalCost!=data.totalCost){
            throw new AppError('The amount of payment does not match',StatusCodes.BAD_REQUEST);
        };

        if(booking.userId!=data.userId){
            throw new AppError('The user corresponding to booking does not match',StatusCodes.BAD_REQUEST);
        }
        
        const response=await bookingRepository.update(data.bookingId,{status:BOOKED},transaction);
        await transaction.commit();
        

    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

module.exports = {
    createBooking,
    makePayment
}